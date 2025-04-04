import os
from datetime import datetime, timedelta
from flask import Flask, send_file, redirect, url_for, request, jsonify, render_template, make_response, Response
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from pymongo import MongoClient
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import random
import string
import google.generativeai as genai
from google.generativeai import types, GenerationConfig
import json
from bson import Binary
import io
import traceback
import tempfile
import pathlib
from io import BytesIO
import re
import base64
from flask_cors import CORS
from PIL import Image, ImageDraw

# Add a custom JSON encoder to handle ObjectId and datetime
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

# Helper function to convert MongoDB objects to JSON serializable objects
def mongo_to_json_serializable(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Binary):
        # Skip Binary data or represent it with metadata
        return "binary_data"
    elif isinstance(obj, bytes):
        # Skip bytes data or represent it with metadata
        return "bytes_data"
    elif isinstance(obj, dict):
        return {k: mongo_to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [mongo_to_json_serializable(item) for item in obj]
    else:
        return obj

def pdf_to_images(pdf_bytes):
    """
    COMPATIBILITY FUNCTION: This function is kept for backward compatibility.
    It logs a warning and uses extract_text_from_pdf to process PDFs.
    
    Returns a list with a single dummy image for compatibility.
    """
    from PIL import Image, ImageDraw
    import io
    
    print("WARNING: Using deprecated pdf_to_images function. Using Gemini 1.5 for text extraction instead.")
    
    # For compatibility, create a dummy image with some text
    img = Image.new('RGB', (800, 600), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 10), "PDF processed with Gemini 1.5", fill=(0, 0, 0))
    
    # Return as a list for compatibility with existing code
    return [img]

load_dotenv()
app = Flask(__name__, template_folder="src", static_folder="src", static_url_path="")
app.json_encoder = MongoJSONEncoder

# Debug logging for API key
print("\n=== Gemini API Configuration Debug ===")
print("Current working directory:", os.getcwd())
print("Checking .env file exists:", os.path.exists(".env"))
if os.path.exists(".env"):
    with open(".env", "r") as f:
        env_contents = f.read()
        print("Number of lines in .env:", len(env_contents.splitlines()))

# Force reload environment variables
load_dotenv(override=True)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print(f"API Key loaded from .env: {'Yes' if GEMINI_API_KEY else 'No'}")
print(f"API Key length: {len(GEMINI_API_KEY) if GEMINI_API_KEY else 0}")
print(f"First 4 chars of API key: {GEMINI_API_KEY[:4] if GEMINI_API_KEY else 'None'}")
print("=====================================\n")

if not GEMINI_API_KEY:
    raise Exception("GEMINI_API_KEY not set in .env file")

if not GEMINI_API_KEY.startswith("AIza"):
    raise Exception("Invalid GEMINI_API_KEY format. Should start with 'AIza'")

try:
    # Configure the Gemini API with debug mode
    print("Attempting to configure Gemini API...")
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")
    # Initialize the model
    gemini_model = genai.GenerativeModel('gemini-2.0-flash')
    gemini_pro_vision = genai.GenerativeModel('gemini-2.0-flash')

    # Test the API connection
    print("Testing API connection...")
    response = gemini_model.generate_content("Hello, Gemini!")
    print("API connection test successful.")
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    raise

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret-key")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
app.config["JWT_TOKEN_LOCATION"] = ["headers", "query_string"]  # Allow tokens in query string
app.config["JWT_QUERY_STRING_NAME"] = "token"  # The query parameter name to look for the JWT
jwt = JWTManager(app)

mongo_url = os.getenv("MONGO_URL")
try:
    client = MongoClient(mongo_url)
    print("MongoDB connected")
except Exception as e:
    print("Error connecting to MongoDB:", e)
db = client["edubridge_db"]
users_collection = db["users"]
classrooms_collection = db["classrooms"]

# Quiz utility functions
# -------------------------------------------------------------------------------------

# Default time buffer for quiz availability (for testing purposes, can be adjusted in production)
QUIZ_TIME_BUFFER = timedelta(minutes=10)

def get_classroom_and_validate_access(classroom_id, user_id, required_role=None):
    """
    Get classroom document and validate user access.
    
    Args:
        classroom_id: The classroom ID
        user_id: The user ID
        required_role: If "teacher", checks if user is the classroom teacher
                      If "student", checks if user is enrolled
                      If None, checks if user is either teacher or student
    
    Returns:
        tuple: (classroom, user, None) if successful, or (None, None, error_response) if failed
    """
    try:
        # Convert to ObjectId
        classroom_obj_id = ObjectId(classroom_id)
        user_obj_id = ObjectId(user_id)
        
        # Find classroom
        classroom = classrooms_collection.find_one({"_id": classroom_obj_id})
        if not classroom:
            return None, None, (jsonify({"msg": "Classroom not found"}), 404)
        
        # Find user
        user = users_collection.find_one({"_id": user_obj_id})
        if not user:
            return None, None, (jsonify({"msg": "User not found"}), 404)
        
        # Check access based on required role
        if required_role == "teacher":
            if user.get("userType") != "teacher" or classroom["teacher_id"] != user_obj_id:
                return None, None, (jsonify({"msg": "Unauthorized. Teacher access required."}), 403)
        elif required_role == "student":
            if user_obj_id not in classroom.get("enrolled_students", []):
                return None, None, (jsonify({"msg": "Unauthorized. Student enrollment required."}), 403)
        else:
            # Either teacher or enrolled student
            if (classroom["teacher_id"] != user_obj_id and 
                user_obj_id not in classroom.get("enrolled_students", [])):
                return None, None, (jsonify({"msg": "Unauthorized to access this classroom"}), 403)
                
        return classroom, user, None
        
    except Exception as e:
        return None, None, (jsonify({"msg": f"Error: {str(e)}"}), 500)

def find_quiz_by_id(classroom, quiz_id):
    """Find a quiz in a classroom by its ID"""
    for quiz in classroom.get("quizzes", []):
        if str(quiz["id"]) == quiz_id:
            return quiz
    return None

def calculate_quiz_end_time(quiz):
    """Calculate the end time for a quiz based on start time and duration"""
    return quiz["startTime"] + timedelta(minutes=int(quiz["duration"]))

def get_quiz_status(quiz, user_obj_id, current_time=None):
    """
    Determine the status of a quiz for a student.
    
    Returns one of: "submitted", "upcoming", "available", "missed"
    """
    if current_time is None:
        # Get current time in IST
        current_time = get_current_ist_time()
    
    # Debug logging
    print(f"Checking quiz status for quiz: {quiz.get('title', 'Unknown')}, ID: {quiz.get('id', 'Unknown')}")
    print(f"Current time (IST): {current_time.isoformat()}")
        
    # Check if student has submitted
    has_submitted = any(
        submission["student_id"] == user_obj_id 
        for submission in quiz.get("submissions", [])
    )
    
    if has_submitted:
        print(f"Quiz status: 'submitted' (Student has already submitted)")
        return "submitted"
        
    # Calculate quiz times
    quiz_start = quiz["startTime"]
    quiz_end = calculate_quiz_end_time(quiz)
    
    # Ensure we're working with datetime objects
    if isinstance(quiz_start, str):
        try:
            quiz_start = datetime.fromisoformat(quiz_start.replace('Z', '+00:00'))
        except ValueError:
            # Try with dateutil parser as fallback
            try:
                from dateutil import parser
                quiz_start = parser.parse(quiz_start)
            except Exception as e:
                print(f"Error parsing start time: {e}")
                return "available"  # Default to available to avoid blocking access
    
    # Convert quiz times from UTC to IST if they're stored in UTC
    # This is necessary if the quiz times are stored in UTC in the database
    # ist_offset = timedelta(hours=5, minutes=30)
    # quiz_start = quiz_start + ist_offset
    # quiz_end = quiz_end + ist_offset
    
    print(f"Quiz start time: {quiz_start.isoformat()}")
    print(f"Quiz end time: {quiz_end.isoformat()}")
    print(f"Time buffer: {QUIZ_TIME_BUFFER}")
    
    # Determine status
    is_before_start = current_time < quiz_start - QUIZ_TIME_BUFFER
    is_after_end = current_time > quiz_end + QUIZ_TIME_BUFFER
    
    print(f"Is before start time? {is_before_start}")
    print(f"Is after end time? {is_after_end}")
    
    if is_before_start:
        print(f"Quiz status: 'upcoming' (Current time is before quiz start)")
        return "upcoming"
    elif is_after_end:
        print(f"Quiz status: 'missed' (Current time is after quiz end)")
        return "missed"
    else:
        print(f"Quiz status: 'available' (Quiz is currently active)")
        return "available"  # Changed from "active" to "available" to match frontend

def prepare_quiz_for_student(quiz, include_correct_answers=False):
    """
    Create a student-friendly version of a quiz object.
    
    Args:
        quiz: The full quiz object
        include_correct_answers: Whether to include correct answers
    
    Returns:
        dict: Student-friendly quiz object
    """
    quiz_end = calculate_quiz_end_time(quiz)
    
    student_quiz = {
        "id": str(quiz["id"]),
        "title": quiz.get("title", "Untitled Quiz"),
        "description": quiz.get("description", ""),
        "startTime": quiz["startTime"],
        "endTime": quiz_end,
        "duration": int(quiz["duration"]),
        "questions": []
    }
    
    # Add questions without correct answers
    for q in quiz["questions"]:
        question_type = q.get("type", "single_choice")  # Default to single choice for backward compatibility
        
        # Start with common question properties
        question = {
            "id": str(q["id"]),
            "text": q["text"],
            "type": question_type
        }
        
        # Handle different question types
        if question_type == "subjective":
            # Subjective questions don't have options
            if include_correct_answers and "modelAnswer" in q:
                question["modelAnswer"] = q["modelAnswer"]
        elif question_type == "multiple_choice":
            # Multiple choice (multiple correct options)
            question["options"] = [
                {"id": opt["id"], "text": opt["text"]} 
                for opt in q["options"]
            ]
            if include_correct_answers and "correctOptions" in q:
                question["correctOptions"] = q["correctOptions"]
        else:
            # Default: single choice questions
            question["options"] = [
                {"id": opt["id"], "text": opt["text"]} 
                for opt in q["options"]
            ]
            if include_correct_answers and "correctOption" in q:
                question["correctOption"] = q["correctOption"]
            
        student_quiz["questions"].append(question)
    
    return student_quiz

def score_quiz_submission(quiz, answers):
    """
    Score a quiz submission.
    
    Args:
        quiz: The quiz object with questions
        answers: Dictionary mapping question IDs to selected option IDs or text answers
        
    Returns:
        tuple: (total_correct, total_questions, scored_answers)
    """
    # Create a mapping of questions by ID for scoring
    questions_map = {str(q["id"]): q for q in quiz["questions"]}
    
    total_questions = len(quiz["questions"])
    correct_count = 0
    scored_answers = {}
    
    # Score each answer
    for question_id, answer_data in answers.items():
        question = questions_map.get(question_id)
        if not question:
            continue
        
        question_type = question.get("type", "single_choice")  # Default for backward compatibility
        
        if question_type == "subjective":
            # Subjective questions are marked for manual grading initially
            # Store the answer text
            if isinstance(answer_data, str):
                scored_answers[question_id] = {
                    "answer": answer_data,
                    "isGraded": False,
                    "score": 0,  # Default 0 until manually graded
                    "maxScore": question.get("points", 1),
                    "feedback": ""
                }
                # Don't add to correct_count as it's not automatically graded
            
        elif question_type == "multiple_choice":
            # Multiple choice can have multiple correct options
            if isinstance(answer_data, list):
                selected_options = set(answer_data)
                correct_options = set(question.get("correctOptions", []))
                
                # Calculate partial credit
                if correct_options:
                    true_positives = len(selected_options.intersection(correct_options))
                    false_positives = len(selected_options - correct_options)
                    false_negatives = len(correct_options - selected_options)
                    
                    max_score = question.get("points", 1)
                    
                    if true_positives == len(correct_options) and false_positives == 0:
                        # Perfect answer
                        score = max_score
                        is_correct = True
                    else:
                        # Partial credit: 
                        # true positives add points, false positives and negatives remove points
                        total_options = len(correct_options)
                        if total_options > 0:
                            # Calculate score from 0 to max_score based on correct options
                            # subtract penalty for incorrect selections
                            score_fraction = (true_positives - (false_positives * 0.5)) / total_options
                            score_fraction = max(0, min(1, score_fraction))  # Clamp between 0 and 1
                            score = score_fraction * max_score
                        else:
                            score = 0
                        
                        is_correct = score >= max_score * 0.9  # Consider 90% or better as "correct"
                        
                    if is_correct:
                        correct_count += 1
                        
                    scored_answers[question_id] = {
                        "selected": answer_data,
                        "correct": question.get("correctOptions", []),
                        "isCorrect": is_correct,
                        "score": score,
                        "maxScore": max_score
                    }
            
        else:
            # Single choice question (original behavior)
            selected_option_id = answer_data
            
            # Check if the selected option is correct
            is_correct = question.get("correctOption", "") == selected_option_id
            if is_correct:
                correct_count += 1
            
            scored_answers[question_id] = {
                "selected": selected_option_id,
                "correct": question.get("correctOption", ""),
                "isCorrect": is_correct,
                "score": question.get("points", 1) if is_correct else 0,
                "maxScore": question.get("points", 1)
            }
    
    return correct_count, total_questions, scored_answers

def create_quiz_results_response(quiz, scored_answers, score, max_score):
    """
    Create a detailed quiz results response for the student.
    
    Args:
        quiz: The quiz object
        scored_answers: Dictionary of scored answers
        score: The student's score
        max_score: The maximum possible score
        
    Returns:
        dict: Detailed quiz results
    """
    questions_with_answers = []
    total_auto_score = 0
    total_auto_max_score = 0
    
    for question in quiz["questions"]:
        question_id = str(question["id"])
        answer_data = scored_answers.get(question_id, {})
        question_type = question.get("type", "single_choice")
        
        # Start with common properties
        question_result = {
            "id": question_id,
            "text": question["text"],
            "type": question_type
        }
        
        if question_type == "subjective":
            # Subjective questions display the submitted answer and feedback
            question_result.update({
                "answer": answer_data.get("answer", ""),
                "isGraded": answer_data.get("isGraded", False),
                "score": answer_data.get("score", 0),
                "maxScore": answer_data.get("maxScore", question.get("points", 1)),
                "feedback": answer_data.get("feedback", ""),
                "modelAnswer": question.get("modelAnswer", "")  # Include model answer in results
            })
            
            # Only count auto-graded questions for total score calculation
            if answer_data.get("isGraded", False):
                total_auto_score += answer_data.get("score", 0)
                total_auto_max_score += answer_data.get("maxScore", question.get("points", 1))
                
        elif question_type == "multiple_choice":
            # Multiple choice questions
            selected_options = answer_data.get("selected", [])
            correct_options = answer_data.get("correct", question.get("correctOptions", []))
            is_correct = answer_data.get("isCorrect", False)
            
            question_result.update({
                "isCorrect": is_correct,
                "userAnswer": selected_options,
                "correctAnswer": correct_options,
                "score": answer_data.get("score", 0),
                "maxScore": answer_data.get("maxScore", question.get("points", 1)),
                "options": [
                    {
                        "id": opt["id"],
                        "text": opt["text"],
                        "isCorrect": opt["id"] in correct_options,
                        "isSelected": opt["id"] in selected_options
                    } for opt in question["options"]
                ]
            })
            
            total_auto_score += answer_data.get("score", 0)
            total_auto_max_score += answer_data.get("maxScore", question.get("points", 1))
                
        else:
            # Single choice questions
            user_answer = answer_data.get("selected", "")
            correct_answer = answer_data.get("correct", question.get("correctOption", ""))
            is_correct = answer_data.get("isCorrect", False)
            
            question_result.update({
                "isCorrect": is_correct,
                "userAnswer": user_answer,
                "correctAnswer": correct_answer,
                "score": answer_data.get("score", 0),
                "maxScore": answer_data.get("maxScore", question.get("points", 1)),
                "options": [
                    {
                        "id": opt["id"],
                        "text": opt["text"],
                        "isCorrect": opt["id"] == correct_answer,
                        "isSelected": opt["id"] == user_answer
                    } for opt in question["options"]
                ]
            })
            
            total_auto_score += answer_data.get("score", 0)
            total_auto_max_score += answer_data.get("maxScore", question.get("points", 1))
            
        questions_with_answers.append(question_result)
    
    # Calculate percentage based on auto-graded questions only
    auto_percentage = round((total_auto_score / total_auto_max_score) * 100, 1) if total_auto_max_score > 0 else 0
    
    # Create a summary of auto-scored and manual questions
    summary = {
        "totalScore": score,
        "totalPossible": max_score,
        "autoGradedScore": total_auto_score,
        "autoGradedMaxScore": total_auto_max_score,
        "manualGradingNeeded": any(q.get("type") == "subjective" for q in quiz["questions"]),
    }
    
    return {
        "score": score,
        "totalPossible": max_score,
        "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0,
        "autoGradedPercentage": auto_percentage,
        "correctCount": sum(1 for q in questions_with_answers if q.get("isCorrect", False)),
        "totalQuestions": len(quiz["questions"]),
        "questions": questions_with_answers,
        "summary": summary
    }

@app.route("/")
def index():
    return send_file('src/index.html')

@app.route("/login")
def login():
    return send_file('src/login.html')

@app.route("/signup")
def signup():
    return send_file('src/signup.html')

@app.route("/get-started")
def get_started():
    return redirect(url_for('signup'))

@app.route("/teacher_dashboard")
def teacher_dashboard():
    return send_file('src/teacher_after_login.html')

@app.route("/teacher_classroom")
def teacher_classroom():
    return send_file('src/teacher_classroom.html')

@app.route("/teacher_profile")
def teacher_profile():
    return send_file('src/teacher_profile_page.html')

@app.route("/dashboard")
def dashboard():
    return render_template('dashboard.html')

@app.route("/profile")
def profile():
    return render_template('profile.html')

@app.route("/announcements")
def announcements():
    return render_template('announcements.html')

@app.route("/courses")
def courses():
    return render_template('courses.html')

@app.route("/calendar")
def calendar():
    return render_template('calendar.html')

@app.route("/settings")
def settings():
    return render_template('settings.html')

@app.route("/student_classroom")
def student_classroom():
    return render_template('student_classroom.html')

@app.route("/quiz")
def quiz_page():
    return send_file('src/student_quiz.html')

@app.route("/quiz-results")
def quiz_results_page():
    return send_file('src/student_quiz_results.html')

@app.route("/quiz-details")
def quiz_details_page():
    return send_file('src/student_quiz_details.html')

@app.route("/enrolled")
def enrolled_students_page():
    return send_file('src/teacher_enrolled.html')

@app.route("/teacher_calendar")
def teacher_calendar():
    return send_file('src/teacher_calendar.html')

@app.route("/Settings")
def teacher_settings():
    return send_file('src/teacher_settings.html')


chat_sessions = {}

@app.route("/chat", methods=["POST"])
@jwt_required()
def chat():
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"error": "User not found"}), 404

    user_role = user.get("userType", "student")
    data = request.get_json()
    if not data or "query" not in data or "function" not in data:
        return jsonify({"error": "Invalid request. 'query' and 'function' fields are required."}), 400

    query = data["query"]
    function_type = data["function"]

    if function_type == "doubt":
        # Use a chat session for multi-turn conversation.
        global chat_sessions
        if user_id not in chat_sessions:
            # Define system instruction for the doubt function
            system_instruction = "You are an AI academic assistant. Answer the user's doubt clearly and concisely. If the user asks for navigation help, instruct them to use the 'navigate' function. If they ask non-academic questions, gently guide them back to their studies."
            # Create and store a new chat session using start_chat
            # Initialize with system instructions and first user query
            chat_sessions[user_id] = gemini_model.start_chat(history=[
                {'role': 'user', 'parts': [system_instruction]},
                {'role': 'model', 'parts': ["Understood. I am ready to help with academic doubts."]}
            ])
            chat = chat_sessions[user_id]
            try:
                # Send the first user query
                response = chat.send_message(query)
                answer = response.text
            except Exception as e:
                answer = f"Error occurred: {str(e)}"
        else:
            # Retrieve existing chat session
            chat = chat_sessions[user_id]
            try:
                # Send the new query to the existing chat session
                response = chat.send_message(query) # Send the new query
                answer = response.text             # Get the text from the new response
            except Exception as e:
                answer = f"Error occurred: {str(e)}"
    elif function_type == "navigate":
        # Stateless call for navigation assistance.
        if user_role == "student":
            system_instruction = (
                "You are an AI assistant helping a student navigate the website. "
                "Provide clear instructions with clickable links (in HTML) for common actions such as 'View Classrooms' or 'Check Calendar'."
                '''Here's the site structure for Student side of EduBridge:
                - Dashboard: /dashboard
                - Calendar: /calendar
                - To-do: /todo
                - Profile: /profile
                - Settings: /settings

                Each page has these common elements:
                - Navbar with logo and profile dropdown
                - Sidebar navigation
                - Floating chatbot icon
                
                The dashboard include classroom in the form of cards, containing the classroom name, subject, and teacher name.'''
                # "If User asks for academic help, give them clear instructions to switch to doubt function of the chatbot."
                # "If User asks for going to a specific classroom, then tell them to go to the dashboard(without Link only in this specific case) and see the classroom."
            )
        else:
            system_instruction = (
                "You are an AI assistant helping a teacher navigate the website. "
                "Provide clear instructions with clickable links (in HTML) for common actions such as 'Manage Classes' or 'View Profile'."
            )
        config = genai.GenerationConfig(
            temperature=0.3,
        )
        try:
            # Using gemini_model instead of gemini_pro_vision as vision model requires images
            # Also passing system instruction directly if needed, or pre-pending to query
            # For now, let's just remove it to fix the immediate error
            answer = gemini_model.generate_content( 
                contents=[system_instruction, query],
                generation_config=config
            )
            answer = answer.text # Get text from the response object
        except Exception as e:
            answer = f"Error occurred: {str(e)}"
    else:
        return jsonify({"error": "Invalid function type."}), 400

    return jsonify({"answer": answer})

@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json()
    if not data:
        return jsonify({"msg": "No input data provided"}), 400
    email = data.get("email")
    if users_collection.find_one({"email": email}):
        return jsonify({"msg": "User already exists"}), 400
    
    # Validate phone number
    phone = data.get("phone", "")
    if not phone:
        return jsonify({"msg": "Phone number is required"}), 400
    
    hashed_pw = generate_password_hash(data.get("password"))
    user = {
        "fullName": data.get("fullName"),
        "email": email,
        "password": hashed_pw,
        "phone": phone,
        "institution": data.get("institution", ""),
        "department": data.get("department", ""),
        "title": data.get("title", ""),
        "bio": data.get("bio", ""),
        # "profileImage": data.get("profileImage", ""), # Removed
        "userType": data.get("userType"),
        "createdAt": datetime.utcnow()
    }
    result = users_collection.insert_one(user)
    return jsonify({"msg": "Signup successful", "user_id": str(result.inserted_id)}), 201

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    if not data:
        return jsonify({"msg": "No input data provided"}), 400
    email = data.get("email")
    password = data.get("password")
    user = users_collection.find_one({"email": email})
    if not user or not check_password_hash(user["password"], password):
        return jsonify({"msg": "Invalid email or password"}), 401
    access_token = create_access_token(identity=str(user["_id"]))
    return jsonify({
        "msg": "Login successful", 
        "access_token": access_token,
        "userType": user["userType"]
    }), 200

@app.route("/api/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404
    user.pop("password", None)
    # Convert to JSON serializable format
    user = mongo_to_json_serializable(user)
    return jsonify(user), 200

@app.route("/api/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    data = request.get_json()
    if not data:
        return jsonify({"msg": "No input data provided"}), 400
    
    # Check if current password is provided and valid
    current_password = data.get("current_password")
    if not current_password:
        return jsonify({"msg": "Current password is required for any profile changes"}), 400
        
    if not check_password_hash(user["password"], current_password):
        return jsonify({"msg": "Current password is incorrect"}), 401
    
    # Initialize update data with only fields that were provided
    update_data = {}
    
    # Handle name change
    if "name" in data:
        update_data["fullName"] = data["name"]
    
    # Handle password change
    if "new_password" in data and data["new_password"]:
        new_password = data["new_password"]
        # You could add additional password validation here
        update_data["password"] = generate_password_hash(new_password)
    
    # If no changes were provided
    if not update_data:
        return jsonify({"msg": "No changes provided"}), 400
    
    # Update the user in the database
    result = users_collection.update_one(
        {"_id": ObjectId(user_id)}, 
        {"$set": update_data}
    )
    
    if result.modified_count:
        return jsonify({"msg": "Profile updated successfully"}), 200
    else:
        # This means the user was found but nothing was changed
        # (e.g., the new values were the same as the old ones)
        return jsonify({"msg": "No changes made to profile"}), 200




BACKGROUND_IMAGES = [
    'https://www.gstatic.com/classroom/themes/img_graduation.jpg',
    'https://www.gstatic.com/classroom/themes/img_code.jpg',
    'https://www.gstatic.com/classroom/themes/img_bookclub.jpg',
    'https://www.gstatic.com/classroom/themes/img_breakfast.jpg',
    'https://www.gstatic.com/classroom/themes/img_reachout.jpg',
    'https://www.gstatic.com/classroom/themes/img_learnlanguage.jpg',
    'https://gstatic.com/classroom/themes/Physics.jpg'
]

def generate_class_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

@app.route("/api/classrooms", methods=["POST"])
@jwt_required()
def create_classroom():
    user_id = get_jwt_identity()
    data = request.get_json()
    class_code = generate_class_code()
    while classrooms_collection.find_one({"classCode": class_code}):
        class_code = generate_class_code()
    header_image = random.choice(BACKGROUND_IMAGES)
    classroom = {
        "teacher_id": ObjectId(user_id),
        "className": data.get("className"),
        "subject": data.get("subject"),
        "section": data.get("section"),
        "room": data.get("room"),
        "classCode": class_code,
        "headerImage": header_image,
        "createdAt": datetime.utcnow(),
        "enrolled_students": [],
        "announcements": []
    }
    result = classrooms_collection.insert_one(classroom)
    classroom["_id"] = str(result.inserted_id)
    classroom["teacher_id"] = user_id
    classroom["createdAt"] = classroom["createdAt"].isoformat()
    return jsonify({"msg": "Classroom created", "classroom": classroom}), 201

@app.route("/api/classrooms", methods=["GET"])
@jwt_required()
def get_classrooms():
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classrooms = []
    if user["userType"] == "teacher":
        query = {"teacher_id": ObjectId(user_id)}
    else:
        query = {"enrolled_students": ObjectId(user_id)}
    for c in classrooms_collection.find(query).sort("createdAt", -1):
        teacher = users_collection.find_one({"_id": c["teacher_id"]})
        c["teacherName"] = teacher["fullName"] if teacher else ""
        # Add header image before conversion
        c["headerImage"] = c.get("headerImage", random.choice(BACKGROUND_IMAGES))
        
        # Add commenter names for all announcements
        if "announcements" in c:
            for ann in c["announcements"]:
                for comment in ann.get("comments", []):
                    cid = comment["commenter_id"]
                    user_obj = users_collection.find_one({"_id": cid})
                    comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
        
        # Remove binary content from quizzes to prevent JSON serialization issues
        if "quizzes" in c:
            for quiz in c["quizzes"]:
                # Remove binary content from question papers and answer keys
                if "questionPaper" in quiz and "content" in quiz["questionPaper"]:
                    # Replace binary content with metadata only
                    quiz["questionPaper"] = {
                        "filename": quiz["questionPaper"].get("filename", "question_paper.pdf"),
                        "contentType": quiz["questionPaper"].get("contentType", "application/pdf"),
                        "size": quiz["questionPaper"].get("size", 0)
                    }
                
                if "answerKey" in quiz and "content" in quiz["answerKey"]:
                    # Replace binary content with metadata only
                    quiz["answerKey"] = {
                        "filename": quiz["answerKey"].get("filename", "answer_key.pdf"),
                        "contentType": quiz["answerKey"].get("contentType", "application/pdf"),
                        "size": quiz["answerKey"].get("size", 0)
                    }
                
                # Handle student submissions with file attachments
                if "submissions" in quiz:
                    for submission in quiz["submissions"]:
                        if "answerFile" in submission and "content" in submission["answerFile"]:
                            submission["answerFile"] = {
                                "filename": submission["answerFile"].get("filename", "answer_file.pdf"),
                                "contentType": submission["answerFile"].get("contentType", "application/pdf"),
                                "size": submission["answerFile"].get("size", 0)
                            }
        
        # Convert the entire classroom object to be JSON serializable
        classrooms.append(mongo_to_json_serializable(c))
    return jsonify(classrooms), 200

@app.route("/api/classrooms/<classroom_id>", methods=["GET"])
@jwt_required()
def get_classroom(classroom_id):
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    teacher = users_collection.find_one({"_id": classroom["teacher_id"]})
    classroom["teacherName"] = teacher["fullName"] if teacher else ""
    classroom["headerImage"] = classroom.get("headerImage", random.choice(BACKGROUND_IMAGES))
    
    # Add commenter names for all announcements
    if "announcements" in classroom:
        for ann in classroom["announcements"]:
            for comment in ann.get("comments", []):
                cid = comment["commenter_id"]
                user_obj = users_collection.find_one({"_id": cid})
                comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
    
    # Remove binary content from quizzes to prevent JSON serialization issues
    if "quizzes" in classroom:
        for quiz in classroom["quizzes"]:
            # Remove binary content from question papers and answer keys
            if "questionPaper" in quiz and "content" in quiz["questionPaper"]:
                # Replace binary content with metadata only
                quiz["questionPaper"] = {
                    "filename": quiz["questionPaper"].get("filename", "question_paper.pdf"),
                    "contentType": quiz["questionPaper"].get("contentType", "application/pdf"),
                    "size": quiz["questionPaper"].get("size", 0)
                }
            
            if "answerKey" in quiz and "content" in quiz["answerKey"]:
                # Replace binary content with metadata only
                quiz["answerKey"] = {
                    "filename": quiz["answerKey"].get("filename", "answer_key.pdf"),
                    "contentType": quiz["answerKey"].get("contentType", "application/pdf"),
                    "size": quiz["answerKey"].get("size", 0)
                }
            
            # Handle student submissions with file attachments
            if "submissions" in quiz:
                for submission in quiz["submissions"]:
                    if "answerFile" in submission and "content" in submission["answerFile"]:
                        submission["answerFile"] = {
                            "filename": submission["answerFile"].get("filename", "answer_file.pdf"),
                            "contentType": submission["answerFile"].get("contentType", "application/pdf"),
                            "size": submission["answerFile"].get("size", 0)
                        }
    
    # Convert the entire classroom object to be JSON serializable
    classroom = mongo_to_json_serializable(classroom)
    return jsonify(classroom), 200

@app.route("/api/classrooms/join", methods=["POST"])
@jwt_required()
def join_classroom():
    user_id = get_jwt_identity()
    data = request.get_json()
    class_code = data.get("classCode")
    if not class_code:
        return jsonify({"msg": "Class code is required"}), 400
    classroom = classrooms_collection.find_one({"classCode": class_code})
    if not classroom:
        return jsonify({"msg": "Invalid class code"}), 404
    if ObjectId(user_id) in classroom.get("enrolled_students", []):
        return jsonify({"msg": "You are already enrolled in this class"}), 400
    classrooms_collection.update_one(
        {"_id": classroom["_id"]},
        {"$push": {"enrolled_students": ObjectId(user_id)}}
    )
    return jsonify({"msg": "Successfully joined the class", "classroomId": str(classroom["_id"])}), 200

@app.route("/api/classrooms/<classroom_id>/announcements", methods=["POST"])
@jwt_required()
def post_classroom_announcement(classroom_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    text = data.get("text")
    if not text:
        return jsonify({"msg": "Announcement text is required"}), 400
    attachments = data.get("attachments", [])
    images = data.get("images", [])
    scheduled_time_str = data.get("scheduledTime")
    scheduled_time = None
    if scheduled_time_str:
        try:
            scheduled_time = datetime.fromisoformat(scheduled_time_str.replace('Z', '+00:00'))
        except Exception:
            scheduled_time = None
    announcement = {
        "announcement_id": ObjectId(),
        "teacher_id": ObjectId(user_id),
        "text": text,
        "postTime": datetime.utcnow() if not scheduled_time else scheduled_time,
        "attachments": attachments,
        "images": images,
        "scheduledTime": scheduled_time.isoformat() if scheduled_time else None,
        "comments": []
    }
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id)},
        {"$push": {"announcements": announcement}}
    )
    if result.modified_count:
        announcement["announcement_id"] = str(announcement["announcement_id"])
        announcement["teacher_id"] = user_id
        if not scheduled_time:
            announcement["postTime"] = announcement["postTime"].isoformat()
        return jsonify({"msg": "Announcement posted", "announcement": announcement}), 201
    return jsonify({"msg": "Classroom not found"}), 404

@app.route("/api/classrooms/<classroom_id>/announcements", methods=["GET"])
@jwt_required()
def get_classroom_announcements(classroom_id):
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    announcements = classroom.get("announcements", [])
    for ann in announcements:
        ann["announcement_id"] = str(ann["announcement_id"])
        ann["teacher_id"] = str(ann["teacher_id"])
        ann["postTime"] = ann["postTime"].isoformat()
        for comment in ann.get("comments", []):
            cid = comment["commenter_id"]
            comment["commenter_id"] = str(cid)
            comment["commentTime"] = comment["commentTime"].isoformat()
            user_obj = users_collection.find_one({"_id": cid})
            comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
    return jsonify(announcements), 200

@app.route("/api/classrooms/<classroom_id>/announcements/<announcement_id>", methods=["PUT"])
@jwt_required()
def edit_classroom_announcement(classroom_id, announcement_id):
    data = request.get_json()
    new_text = data.get("text")
    if not new_text:
        return jsonify({"msg": "New text is required"}), 400
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id), "announcements.announcement_id": ObjectId(announcement_id)},
        {"$set": {"announcements.$.text": new_text}}
    )
    if result.modified_count:
        return jsonify({"msg": "Announcement updated"}), 200
    return jsonify({"msg": "Announcement not found"}), 404

@app.route("/api/classrooms/<classroom_id>/announcements/<announcement_id>", methods=["DELETE"])
@jwt_required()
def delete_classroom_announcement(classroom_id, announcement_id):
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id)},
        {"$pull": {"announcements": {"announcement_id": ObjectId(announcement_id)}}}
    )
    if result.modified_count:
        return jsonify({"msg": "Announcement deleted"}), 200
    return jsonify({"msg": "Announcement not found"}), 404

@app.route("/api/classrooms/<classroom_id>/announcements/<announcement_id>/comments", methods=["POST"])
@jwt_required()
def post_classroom_comment(classroom_id, announcement_id):
    user_id = get_jwt_identity()
    data = request.get_json()
    text = data.get("text")
    if not text:
        return jsonify({"msg": "Comment text is required"}), 400
    comment = {
        "commenter_id": ObjectId(user_id),
        "text": text,
        "commentTime": datetime.utcnow()
    }
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id), "announcements.announcement_id": ObjectId(announcement_id)},
        {"$push": {"announcements.$.comments": comment}}
    )
    if result.modified_count:
        comment["commenter_id"] = user_id
        comment["commentTime"] = comment["commentTime"].isoformat()
        user_obj = users_collection.find_one({"_id": ObjectId(user_id)})
        comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
        return jsonify({"msg": "Comment added", "comment": comment}), 201
    return jsonify({"msg": "Announcement not found"}), 404

# Quiz-related API routes
# -------------------------------------------------------------------------------------

# Teacher endpoints
@app.route("/api/classrooms/<classroom_id>/quizzes", methods=["GET"])
@jwt_required()
def get_classroom_quizzes(classroom_id):
    """Get all quizzes for a classroom - teacher view"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Process quizzes
        quizzes = classroom.get("quizzes", [])
        
        # Process each quiz
        for quiz in quizzes:
            # Common processing for all quiz types
            if "submissions" in quiz:
                # Calculate submission stats
                total_submissions = len(quiz["submissions"])
                
                # For PDF quizzes, we need to handle differently
                quiz_type = quiz.get("quizType", "question")  # Default to question type for backwards compatibility
                
                if quiz_type == "pdf":
                    # For PDF quizzes, collect grading statistics
                    graded_count = sum(1 for sub in quiz["submissions"] if sub.get("isGraded", False))
                    total_score = sum(sub.get("score", 0) for sub in quiz["submissions"] if sub.get("isGraded", False))
                    avg_score = total_score / graded_count if graded_count > 0 else 0
                    
                    quiz["submissionStats"] = {
                        "submissionCount": total_submissions,
                        "gradedCount": graded_count,
                        "pendingCount": total_submissions - graded_count,
                        "averageScore": round(avg_score, 1) if graded_count > 0 else "N/A",
                        "averagePercentage": round((avg_score / 100) * 100, 1) if graded_count > 0 else "N/A"
                    }
                else:
                    # Original processing for question-based quizzes
                    total_score = sum(sub.get("score", 0) for sub in quiz["submissions"])
                    max_possible = sum(sub.get("maxScore", 0) for sub in quiz["submissions"])
                    avg_score = total_score / total_submissions if total_submissions > 0 else 0
                    max_per_submission = max(sub.get("maxScore", 0) for sub in quiz["submissions"]) if quiz["submissions"] else 0
                    
                    quiz["submissionStats"] = {
                        "submissionCount": total_submissions,
                        "averageScore": round(avg_score, 1),
                        "averagePercentage": round((avg_score / max_per_submission) * 100, 1) if max_per_submission > 0 else 0
                    }
                
                # Add student names to all quiz types
                for submission in quiz["submissions"]:
                    student = users_collection.find_one({"_id": submission["student_id"]})
                    submission["studentName"] = student["fullName"] if student else "Unknown"
                    
                    # Calculate percentage score for each submission
                    max_score = submission.get("maxScore", 0)
                    score = submission.get("score", 0)
                    submission["percentage"] = round((score / max_score) * 100, 1) if max_score > 0 else 0
            
            # Remove binary content from response to reduce size
            if "questionPaper" in quiz and "content" in quiz["questionPaper"]:
                # Replace binary content with metadata only
                quiz["questionPaper"] = {
                    "filename": quiz["questionPaper"].get("filename", "question_paper.pdf"),
                    "contentType": quiz["questionPaper"].get("contentType", "application/pdf"),
                    "size": quiz["questionPaper"].get("size", 0)
                }
                
            if "answerKey" in quiz and "content" in quiz["answerKey"]:
                # Replace binary content with metadata only
                quiz["answerKey"] = {
                    "filename": quiz["answerKey"].get("filename", "answer_key.pdf"),
                    "contentType": quiz["answerKey"].get("contentType", "application/pdf"),
                    "size": quiz["answerKey"].get("size", 0)
                }
            
            # Ensure end time is calculated
            quiz["endTime"] = calculate_quiz_end_time(quiz)
        
        # Return serialized quizzes
        return jsonify(mongo_to_json_serializable(quizzes)), 200
    
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving quizzes: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes", methods=["POST"])
@jwt_required()
def create_classroom_quiz(classroom_id):
    """Create a new quiz for a classroom with PDF support"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Get form data and files
        data = request.form
        question_paper_file = request.files.get('questionPaper')
        answer_key_file = request.files.get('answerKey')
        
        # Validate required fields
        if not data:
            return jsonify({"msg": "Quiz data is required"}), 400
        
        # Check required fields
        required_fields = ["title", "description", "startTime", "duration"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({"msg": f"Missing required fields: {', '.join(missing_fields)}"}), 400
        
        # Validate at least one PDF is required
        if not question_paper_file:
            return jsonify({"msg": "Question paper PDF is required"}), 400
        
        # Validate files are PDFs
        if question_paper_file and not question_paper_file.filename.lower().endswith('.pdf'):
            return jsonify({"msg": "Question paper must be a PDF file"}), 400
            
        if answer_key_file and not answer_key_file.filename.lower().endswith('.pdf'):
            return jsonify({"msg": "Answer key must be a PDF file"}), 400
        
        # Parse dates
        try:
            start_time = datetime.fromisoformat(data["startTime"].replace('Z', '+00:00'))
        except ValueError as e:
            return jsonify({"msg": f"Invalid date format for startTime: {str(e)}. Use ISO format YYYY-MM-DDTHH:MM:SS"}), 400
        
        # Validate duration
        try:
            duration = int(data["duration"])
            if duration <= 0:
                return jsonify({"msg": "Duration must be a positive integer"}), 400
        except ValueError:
            return jsonify({"msg": "Duration must be a positive integer"}), 400
        
        # Process file uploads and store as binary data
        question_paper_binary = question_paper_file.read() if question_paper_file else None
        answer_key_binary = answer_key_file.read() if answer_key_file else None
        
        # Create quiz object with PDF data
        quiz = {
            "id": ObjectId(),
            "title": data["title"],
            "description": data["description"],
            "startTime": start_time,
            "duration": duration,
            "published": data.get("published", "true").lower() == "true",
            "quizType": "pdf",  # Indicate this is a PDF-based quiz
            "questionPaper": {
                "filename": question_paper_file.filename,
                "content": Binary(question_paper_binary),  # Store as Binary data in MongoDB
                "contentType": "application/pdf",
                "size": len(question_paper_binary)
            },
            "submissions": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        
        # Add answer key if provided
        if answer_key_binary:
            quiz["answerKey"] = {
                "filename": answer_key_file.filename,
                "content": Binary(answer_key_binary),  # Store as Binary data in MongoDB
                "contentType": "application/pdf",
                "size": len(answer_key_binary)
            }
        
        # ============ AUTOMATIC PDF TEXT EXTRACTION ============
        print("\n===== AUTOMATIC PDF TEXT EXTRACTION STARTED =====")
        print(f"Processing quiz: {quiz['title']}")
        
        # Extract text from question paper PDF
        question_paper_extracted_texts = []
        try:
            print(f"\nExtracting text from question paper: {question_paper_file.filename}")
            
            # Extract text using Gemini 1.5
            print("Extracting text from question paper PDF...")
            question_paper_text = extract_text_from_pdf(question_paper_binary)
            print(f"Extracted text from question paper: {len(question_paper_text)} characters")
            print(f"Sample text: {question_paper_text}...")
            
            # Segregate questions by number
            print("Segregating questions by number...")
            segregated_questions = segregate_questions_by_number(question_paper_text, is_question_paper=True)
            
            question_paper_extracted_texts.append(question_paper_text)
            
            print(f"Successfully extracted text from question paper")
            
            # Add extracted text to quiz
            quiz["extractedText"] = {
                "questionPaper": question_paper_extracted_texts,
                "segregatedQuestions": segregated_questions,
                "timestamp": datetime.utcnow()
            }
            
        except Exception as e:
            print(f"ERROR extracting text from question paper: {str(e)}")
            traceback.print_exc()
            print("Continuing without question paper text extraction")
        
        # Extract text from answer key PDF if provided
        if answer_key_binary:
            answer_key_extracted_texts = []
            try:
                print(f"\nExtracting text from answer key: {answer_key_file.filename}")
                
                # Extract text using Gemini 1.5
                print("Extracting text from answer key PDF...")
                answer_key_text = extract_text_from_pdf(answer_key_binary)
                print(f"Extracted text from answer key: {len(answer_key_text)} characters")
                print(f"Sample text: {answer_key_text}...")
                
                # Segregate answer key by question number
                print("Segregating answer key by question number...")
                segregated_answers = segregate_questions_by_number(answer_key_text, is_question_paper=False)
                
                answer_key_extracted_texts.append(answer_key_text)
                
                print(f"Successfully extracted text from answer key")
                
                # Add extracted answer key text to quiz
                if "extractedText" not in quiz:
                    quiz["extractedText"] = {"timestamp": datetime.utcnow()}
                
                quiz["extractedText"]["answerKey"] = answer_key_extracted_texts
                quiz["extractedText"]["segregatedAnswers"] = segregated_answers
                
            except Exception as e:
                print(f"ERROR extracting text from answer key: {str(e)}")
                traceback.print_exc()
                print("Continuing without answer key text extraction")
        
        # Print summary
        if "extractedText" in quiz:
            question_pages = len(quiz["extractedText"].get("questionPaper", []))
            answer_pages = len(quiz["extractedText"].get("answerKey", []))
            
            print("\n===== PDF TEXT EXTRACTION SUMMARY =====")
            print(f"Quiz: {quiz['title']}")
            print(f"Question paper pages processed: {question_pages}")
            print(f"Answer key pages processed: {answer_pages}")
            print("Extracted text saved to database")
        
        print("===== AUTOMATIC PDF TEXT EXTRACTION COMPLETE =====\n")
        # ============ END PDF TEXT EXTRACTION ============
        
        # Add quiz to classroom
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id)},
            {"$push": {"quizzes": quiz}}
        )
        
        if result.modified_count:
            # Calculate and add end time for response
            quiz["endTime"] = calculate_quiz_end_time(quiz)
            
            # Create a version of the quiz without the binary data for the response
            response_quiz = {k: v for k, v in quiz.items() if k not in ["questionPaper", "answerKey"]}
            
            # Add file info without the binary content
            if "questionPaper" in quiz:
                response_quiz["questionPaper"] = {
                    "filename": quiz["questionPaper"]["filename"],
                    "contentType": quiz["questionPaper"]["contentType"],
                    "size": quiz["questionPaper"]["size"]
                }
                
            if "answerKey" in quiz:
                response_quiz["answerKey"] = {
                    "filename": quiz["answerKey"]["filename"],
                    "contentType": quiz["answerKey"]["contentType"],
                    "size": quiz["answerKey"]["size"]
                }
            
            # Include text extraction status in response
            if "extractedText" in quiz:
                response_quiz["textExtractionStatus"] = "completed"
                response_quiz["questionPaperTextPages"] = len(quiz["extractedText"].get("questionPaper", []))
                response_quiz["answerKeyTextPages"] = len(quiz["extractedText"].get("answerKey", []))
            
            return jsonify({
                "msg": "Quiz created successfully", 
                "quiz": mongo_to_json_serializable(response_quiz)
            }), 201
        
        return jsonify({"msg": "Failed to create quiz"}), 500
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error creating quiz: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>", methods=["GET"])
@jwt_required()
def get_classroom_quiz(classroom_id, quiz_id):
    """Get a specific quiz"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Process quiz based on user type
        is_teacher = classroom["teacher_id"] == ObjectId(user_id)
        
        # For teachers, automatically extract PDF text if not already done
        if is_teacher and not quiz.get("extractedText"):
            print(f"\n===== AUTOMATIC PDF TEXT EXTRACTION FOR QUIZ =====")
            print(f"Quiz: {quiz.get('title', 'Untitled Quiz')} (ID: {quiz_id})")
            
            # Check for question paper PDF
            pdf_processed = False
            if quiz.get("questionPaper") and "content" in quiz.get("questionPaper", {}):
                try:
                    print(f"Found question paper PDF: {quiz['questionPaper'].get('filename', 'unnamed')}")
                    
                    # Extract question paper PDF content
                    pdf_binary = quiz["questionPaper"]["content"]
                    
                    # Use new robust extraction method
                    print("Extracting text from question paper PDF...")
                    question_paper_text = extract_text_from_pdf(pdf_binary)
                    
                    # Process answer key PDF if available
                    answer_key_text = None
                    if quiz.get("answerKey") and "content" in quiz.get("answerKey", {}):
                        print(f"\nFound answer key PDF: {quiz['answerKey'].get('filename', 'unnamed')}")
                        
                        # Extract answer key PDF content
                        answer_key_binary = quiz["answerKey"]["content"]
                        
                        # Use new robust extraction method
                        print("Extracting text from answer key PDF...")
                        answer_key_text = extract_text_from_pdf(answer_key_binary)
                    
                    # Save extracted text to database
                    extracted_text = {
                        "timestamp": datetime.utcnow()
                    }
                    
                    if question_paper_text:
                        extracted_text["questionPaper"] = [question_paper_text]
                        
                    if answer_key_text:
                        extracted_text["answerKey"] = [answer_key_text]
                    
                    # Only save if we have extracted text
                    if "questionPaper" in extracted_text or "answerKey" in extracted_text:
                        print("\nSaving extracted text to database...")
                        
                        result = classrooms_collection.update_one(
                            {"_id": ObjectId(classroom_id), "quizzes.id": ObjectId(quiz_id)},
                            {"$set": {"quizzes.$.extractedText": extracted_text}}
                        )
                        
                        if result.modified_count == 1:
                            print("Text extraction saved to database successfully")
                            
                            # Update the quiz object with extracted text for the response
                            quiz["extractedText"] = extracted_text
                            pdf_processed = True
                        else:
                            print("Warning: Failed to save text extraction to database")
                    else:
                        print("No text was extracted from either PDF")
                    
                except Exception as e:
                    print(f"Error extracting text from PDF: {str(e)}")
                    traceback.print_exc()
            
            print(f"===== PDF TEXT EXTRACTION {'COMPLETED' if pdf_processed else 'FAILED'} =====\n")
        
        if is_teacher:
            # Teacher view - include all information
            # Add student names to submissions
            if "submissions" in quiz:
                for submission in quiz["submissions"]:
                    student = users_collection.find_one({"_id": submission["student_id"]})
                    submission["studentName"] = student["fullName"] if student else "Unknown"
            
            # Add end time
            quiz["endTime"] = calculate_quiz_end_time(quiz)
        else:
            # Student view - hide correct answers
            user_obj_id = ObjectId(user_id)
            quiz_status = get_quiz_status(quiz, user_obj_id)
            
            # Prepare student view of quiz
            quiz = prepare_quiz_for_student(quiz, include_correct_answers=False)
            quiz["studentStatus"] = quiz_status
            
            # If submitted, include the student's submission details
            if quiz_status == "submitted":
                for submission in quiz["submissions"]:
                    if submission["student_id"] == user_obj_id:
                        quiz["submission"] = mongo_to_json_serializable(submission)
                        break
        
        return jsonify(mongo_to_json_serializable(quiz)), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving quiz: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>", methods=["PUT"])
@jwt_required()
def update_classroom_quiz(classroom_id, quiz_id):
    """Update an existing quiz"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = None
        quiz_index = -1
        
        for i, q in enumerate(classroom.get("quizzes", [])):
            if str(q["id"]) == quiz_id:
                quiz = q
                quiz_index = i
                break
                
        if quiz is None:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Check if quiz has submissions (limit what can be changed)
        has_submissions = len(quiz.get("submissions", [])) > 0
        
        # Check if this is a PDF quiz
        is_pdf_quiz = quiz.get("quizType") == "pdf"
        
        # Process request based on content type
        if is_pdf_quiz:
            # Handle PDF quiz update with FormData (multipart/form-data)
            data = request.form
            question_paper_file = request.files.get('questionPaper')
            answer_key_file = request.files.get('answerKey')
            
            if not data:
                return jsonify({"msg": "Quiz data is required"}), 400
            
            # Create updated quiz object
            updated_quiz = quiz.copy()
            
            # Update basic fields
            for field in ["title", "description", "published"]:
                if field in data:
                    if field == "published":
                        updated_quiz[field] = data.get(field).lower() == "true"
                    else:
                        updated_quiz[field] = data.get(field)
            
            # Handle time updates if no submissions exist
            try:
                # If start time is updated
                if "startTime" in data:
                    if has_submissions:
                        return jsonify({"msg": "Cannot update start time for a quiz with existing submissions"}), 400
                        
                    updated_quiz["startTime"] = datetime.fromisoformat(data["startTime"].replace('Z', '+00:00'))
                
                # If duration is updated
                if "duration" in data:
                    if has_submissions and int(data["duration"]) < updated_quiz["duration"]:
                        return jsonify({"msg": "Cannot shorten duration for a quiz with existing submissions"}), 400
                        
                    updated_quiz["duration"] = int(data["duration"])
                    if updated_quiz["duration"] <= 0:
                        return jsonify({"msg": "Duration must be a positive integer"}), 400
            except ValueError as e:
                return jsonify({"msg": f"Invalid date format or duration: {str(e)}"}), 400
            
            # Only update files if new ones are provided
            if question_paper_file:
                # Validate files are PDFs
                if not question_paper_file.filename.lower().endswith('.pdf'):
                    return jsonify({"msg": "Question paper must be a PDF file"}), 400
                
                # Process new question paper file
                question_paper_binary = question_paper_file.read()
                updated_quiz["questionPaper"] = {
                    "filename": question_paper_file.filename,
                    "content": Binary(question_paper_binary),
                    "contentType": "application/pdf",
                    "size": len(question_paper_binary)
                }
            
            if answer_key_file:
                # Validate files are PDFs
                if not answer_key_file.filename.lower().endswith('.pdf'):
                    return jsonify({"msg": "Answer key must be a PDF file"}), 400
                
                # Process new answer key file
                answer_key_binary = answer_key_file.read()
                updated_quiz["answerKey"] = {
                    "filename": answer_key_file.filename,
                    "content": Binary(answer_key_binary),
                    "contentType": "application/pdf",
                    "size": len(answer_key_binary)
                }
                
        else:
            # Handle regular quiz update with JSON data
            data = request.get_json()
        if not data:
            return jsonify({"msg": "Quiz data is required"}), 400
        
        # Create updated quiz object
        updated_quiz = quiz.copy()
        
        # Update basic fields
        for field in ["title", "description", "published"]:
            if field in data:
                updated_quiz[field] = data[field]
        
        # Handle questions update if provided and no submissions exist
        if "questions" in data:
            if has_submissions:
                return jsonify({"msg": "Cannot update questions for a quiz with existing submissions"}), 400
                
            questions = data["questions"]
            if not questions or not isinstance(questions, list) or len(questions) == 0:
                return jsonify({"msg": "At least one question is required"}), 400
            
            # Process questions and options (similar to creation)
            processed_questions = []
            for i, question in enumerate(questions):
                if "text" not in question:
                    return jsonify({"msg": f"Question {i+1} is missing required text field"}), 400
                
                # Get the question type, defaulting to single_choice for backward compatibility
                question_type = question.get("type", "single_choice")
                
                # Start with basic question fields
                processed_question = {
                    "id": question.get("id", str(ObjectId())),
                    "text": question["text"],
                    "type": question_type,
                    "points": int(question.get("points", 1))  # Allow setting point value for each question
                }
                
                # Process based on question type
                if question_type == "subjective":
                    # Subjective questions don't have options but may have a model answer
                    if "modelAnswer" in question:
                        processed_question["modelAnswer"] = question["modelAnswer"]
                    
                elif question_type == "multiple_choice":
                    # Multiple choice questions: verify options and correct options (plural)
                    if "options" not in question or not question["options"]:
                        return jsonify({"msg": f"Question {i+1} is missing options"}), 400
                    
                    if "correctOptions" not in question or not question["correctOptions"]:
                        return jsonify({"msg": f"Question {i+1} is missing correctOptions"}), 400
                    
                    # Process options
                    processed_options = []
                    for j, option in enumerate(question["options"]):
                        if "text" not in option:
                            return jsonify({"msg": f"Option {j+1} in question {i+1} is missing text field"}), 400
                            
                        option_id = option.get("id", str(ObjectId()))
                        processed_options.append({
                            "id": option_id,
                            "text": option["text"]
                        })
                    
                    # Validate correctOptions exists in options
                    correct_options = question["correctOptions"]
                    if not isinstance(correct_options, list):
                        return jsonify({"msg": f"Question {i+1} has correctOptions that is not a list"}), 400
                    
                    for opt_id in correct_options:
                        if not any(opt["id"] == opt_id for opt in processed_options):
                            return jsonify({"msg": f"Question {i+1} has a correctOption that doesn't match any option ID"}), 400
                    
                    processed_question["options"] = processed_options
                    processed_question["correctOptions"] = correct_options
                    
                else:
                    # Default: single choice questions
                    if "options" not in question or not question["options"]:
                        return jsonify({"msg": f"Question {i+1} is missing options"}), 400
                    
                    if "correctOption" not in question:
                        return jsonify({"msg": f"Question {i+1} is missing correctOption"}), 400
                    
                    # Process options
                    processed_options = []
                    for j, option in enumerate(question["options"]):
                        if "text" not in option:
                            return jsonify({"msg": f"Option {j+1} in question {i+1} is missing text field"}), 400
                            
                        option_id = option.get("id", str(ObjectId()))
                        processed_options.append({
                            "id": option_id,
                            "text": option["text"]
                        })
                    
                    # Validate correctOption exists in options
                    correct_option = question["correctOption"]
                    if not any(opt["id"] == correct_option for opt in processed_options):
                        return jsonify({"msg": f"Question {i+1} has an invalid correctOption that doesn't match any option ID"}), 400
                    
                    processed_question["options"] = processed_options
                    processed_question["correctOption"] = correct_option
                
                # Add the processed question
                processed_questions.append(processed_question)
            
            # Update quiz with processed questions
            updated_quiz["questions"] = processed_questions
        
        # Handle time updates if no submissions exist
        try:
            # If start time is updated
            if "startTime" in data:
                if has_submissions:
                    return jsonify({"msg": "Cannot update start time for a quiz with existing submissions"}), 400
                    
                updated_quiz["startTime"] = datetime.fromisoformat(data["startTime"].replace('Z', '+00:00'))
            
            # If duration is updated
            if "duration" in data:
                if has_submissions and data["duration"] < updated_quiz["duration"]:
                    return jsonify({"msg": "Cannot shorten duration for a quiz with existing submissions"}), 400
                    
                updated_quiz["duration"] = int(data["duration"])
                if updated_quiz["duration"] <= 0:
                    return jsonify({"msg": "Duration must be a positive integer"}), 400
        except ValueError as e:
            return jsonify({"msg": f"Invalid date format or duration: {str(e)}"}), 400
        
        # Update modified timestamp
        updated_quiz["updatedAt"] = datetime.utcnow()
        
        # Update the quiz in classroom
        classroom["quizzes"][quiz_index] = updated_quiz
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id)},
            {"$set": {"quizzes": classroom["quizzes"]}}
        )
        
        if result.modified_count:
            # Calculate and add end time for response
            updated_quiz["endTime"] = calculate_quiz_end_time(updated_quiz)
            return jsonify({
                "msg": "Quiz updated successfully", 
                "quiz": mongo_to_json_serializable(updated_quiz)
            }), 200
            
        return jsonify({"msg": "No changes made to quiz"}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error updating quiz: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>", methods=["DELETE"])
@jwt_required()
def delete_classroom_quiz(classroom_id, quiz_id):
    """Delete a quiz"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
            
        # Check if quiz has submissions
        if quiz.get("submissions") and len(quiz["submissions"]) > 0:
            return jsonify({"msg": "Cannot delete a quiz with existing submissions. Consider unpublishing it instead."}), 400
        
        # Delete the quiz
        updated_quizzes = [q for q in classroom["quizzes"] if str(q["id"]) != quiz_id]
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id)},
            {"$set": {"quizzes": updated_quizzes}}
        )
        
        if result.modified_count:
            return jsonify({"msg": "Quiz deleted successfully"}), 200
        return jsonify({"msg": "No changes made"}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error deleting quiz: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/results", methods=["GET"])
@jwt_required()
def get_quiz_results(classroom_id, quiz_id):
    """Get results for a quiz - teacher view"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
            
        # Identify quiz type
        quiz_type = quiz.get("quizType", "question")  # Default to question type for backwards compatibility
        
        # Process submissions
        submissions = []
        for submission in quiz.get("submissions", []):
            # Get student info
            student = users_collection.find_one({"_id": submission["student_id"]})
            submission_copy = submission.copy()
            submission_copy["studentName"] = student["fullName"] if student else "Unknown"
            submission_copy["studentEmail"] = student["email"] if student else ""
            
            # Calculate percentage score
            max_score = submission.get("maxScore", 0)
            score = submission.get("score", 0)
            submission_copy["percentage"] = round((score / max_score) * 100, 1) if max_score > 0 else 0
            
            # Process differently based on quiz type
            if quiz_type == "pdf":
                # For PDF quizzes, simply add grading status
                submission_copy["isGraded"] = submission.get("isGraded", False)
                submission_copy["feedback"] = submission.get("feedback", "")
                
                # Add auto-grading info if available
                if submission.get("autoGraded"):
                    submission_copy["autoGraded"] = True
                    
                    # Include summary of auto-graded questions
                    if "questionGradingResults" in submission:
                        question_count = len(submission["questionGradingResults"])
                        submission_copy["autoGradedQuestionCount"] = question_count
                        
                        # Add preview of question scores
                        submission_copy["gradedQuestionSummary"] = {
                            "totalQuestions": question_count,
                            "totalScore": submission.get("score", 0),
                            "maxScore": submission.get("maxScore", 0)
                        }
                
                # Add file info if available
                if "answerFile" in submission:
                    submission_copy["answerFile"] = {
                        "filename": submission["answerFile"].get("filename", "answer.pdf"),
                        "size": submission["answerFile"].get("size", 0)
                    }
                
                # Add extracted text info if available
                if "extractedText" in submission:
                    text_length = len(submission["extractedText"])
                    submission_copy["textExtracted"] = True
                    submission_copy["textLength"] = text_length
                    submission_copy["textPreview"] = submission["extractedText"][:200] + "..." if text_length > 200 else submission["extractedText"]
                    submission_copy["extractedTextUrl"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/submissions/{str(submission['student_id'])}/extracted-text"
                    
                    # Add segregated answers info if available
                    if "segregatedAnswers" in submission:
                        answer_count = len(submission["segregatedAnswers"]) - (1 if "0" in submission["segregatedAnswers"] else 0)
                        submission_copy["answersSegregated"] = True
                        submission_copy["answerCount"] = answer_count
                        submission_copy["segregatedAnswersPreview"] = {
                            k: v[:50] + "..." if len(v) > 50 else v
                            for k, v in list(submission["segregatedAnswers"].items())[:3]
                        }
                        submission_copy["segregatedAnswersUrl"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/submissions/{str(submission['student_id'])}/segregated-answers"
                
                elif "extractionError" in submission:
                    submission_copy["textExtracted"] = False
                    submission_copy["extractionError"] = submission["extractionError"]
            else:
                # For question-based quizzes, process subjective questions
                subjective_status = {
                    "total": 0,
                    "graded": 0,
                    "pending": 0
                }
            
                # Check each answer
                if "questions" in quiz:
                    for question in quiz["questions"]:
                        q_id = str(question["id"])
                        q_type = question.get("type", "single_choice")
                        
                        if q_type == "subjective" and q_id in submission.get("answers", {}):
                            subjective_status["total"] += 1
                            if submission["answers"][q_id].get("isGraded", False):
                                subjective_status["graded"] += 1
                            else:
                                subjective_status["pending"] += 1
                
                submission_copy["subjectiveStatus"] = subjective_status
            
            submissions.append(submission_copy)
        
        # Calculate statistics
        total_score = sum(submission["score"] for submission in submissions)
        max_score = sum(submission["maxScore"] for submission in submissions)
        avg_score = total_score / len(submissions) if submissions else 0
        max_per_submission = max(submission["maxScore"] for submission in submissions) if submissions else 0
        
        # Create a summary of auto-scored and manual questions
        summary = {
            "totalScore": total_score,
            "totalPossible": max_score,
            "autoGradedScore": sum(submission["score"] for submission in submissions if submission.get("isGraded", False)),
            "autoGradedMaxScore": sum(submission["maxScore"] for submission in submissions if submission.get("isGraded", False)),
            "manualGradingNeeded": any(q.get("type") == "subjective" for q in quiz["questions"]),
        }
        
        return jsonify({
            "score": total_score,
            "totalPossible": max_score,
            "percentage": round((total_score / max_score) * 100, 1) if max_score > 0 else 0,
            "autoGradedPercentage": round((summary["autoGradedScore"] / summary["autoGradedMaxScore"]) * 100, 1) if summary["autoGradedMaxScore"] > 0 else 0,
            "correctCount": sum(1 for submission in submissions if submission.get("isCorrect", False)),
            "totalQuestions": len(quiz["questions"]),
            "questions": submissions,
            "summary": summary
        }), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error getting student quiz results: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/pdf/<file_type>", methods=["GET"])
@jwt_required()
def get_quiz_pdf(classroom_id, quiz_id, file_type):
    """Get PDF from a quiz (question paper or answer key)"""
    # Get the token from query parameter or JWT header
    user_id = get_jwt_identity()
    
    # Find classroom and check access
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
    if error:
        return error
    
    try:
        # Instead of using the returned classroom, fetch the quiz directly from the database
        # to ensure we have the binary content
        classroom_obj = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
        if not classroom_obj:
            return jsonify({"msg": "Classroom not found"}), 404
            
        # Find the quiz
        quiz = None
        for q in classroom_obj.get("quizzes", []):
            if str(q["id"]) == quiz_id:
                quiz = q
                break
                
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        is_teacher = user.get("userType") == "teacher"
        
        # Validate file type
        if file_type not in ["questionPaper", "answerKey"]:
            return jsonify({"msg": "Invalid file type. Must be 'questionPaper' or 'answerKey'"}), 400
        
        # Only teachers can access answer keys
        if file_type == "answerKey" and not is_teacher:
            return jsonify({"msg": "Unauthorized access to answer key"}), 403
        
        # If student wants the question paper, make sure quiz is published and active/available
        if not is_teacher and file_type == "questionPaper":
            user_obj_id = ObjectId(user_id)
            quiz_status = get_quiz_status(quiz, user_obj_id)
            if quiz_status not in ["available", "submitted"]:
                return jsonify({"msg": f"You cannot access this quiz in its current state ({quiz_status})"}), 403
        
        # Check if requested file exists
        if file_type not in quiz:
            return jsonify({"msg": f"The requested file ({file_type}) does not exist for this quiz"}), 404
        
        # Get the file data
        file_data = quiz[file_type]
        
        # Check if content exists in the file_data
        if "content" not in file_data:
            return jsonify({"msg": f"The file content is missing"}), 500
        
        # Return PDF file
        return send_file(
            io.BytesIO(file_data["content"]),
            mimetype=file_data.get("contentType", "application/pdf"),
            as_attachment=True,
            download_name=file_data.get("filename", f"{file_type}.pdf")
        )
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving quiz PDF: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/pdf", methods=["GET"])
@jwt_required()
def get_student_submission_pdf(classroom_id, quiz_id, student_id):
    """Get PDF submission from a student"""
    # Get the token from query parameter or JWT header
    user_id = get_jwt_identity()
    
    # Only teachers can access this endpoint
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Fetch classroom directly from the database to ensure we have binary content
        classroom_obj = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
        if not classroom_obj:
            return jsonify({"msg": "Classroom not found"}), 404
            
        # Find the quiz
        quiz = None
        for q in classroom_obj.get("quizzes", []):
            if str(q["id"]) == quiz_id:
                quiz = q
                break
                
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find student submission
        submission = None
        student_obj_id = ObjectId(student_id)
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == student_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "Student submission not found"}), 404
        
        # Check if the submission has a PDF file
        if "answerFile" not in submission:
            return jsonify({"msg": "This submission has no PDF file attached"}), 404
        
        # Get the file data
        file_data = submission["answerFile"]
        
        # Check if content exists in the file_data
        if "content" not in file_data:
            return jsonify({"msg": "The file content is missing"}), 500
        
        # Return PDF file
        return send_file(
            io.BytesIO(file_data["content"]),
            mimetype=file_data.get("contentType", "application/pdf"),
            as_attachment=True,
            download_name=file_data.get("filename", "student_submission.pdf")
        )
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving submission PDF: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/grade-pdf", methods=["POST"])
@jwt_required()
def grade_pdf_submission(classroom_id, quiz_id, student_id):
    """Grade a student's PDF quiz submission"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find the student's submission
        student_obj_id = ObjectId(student_id)
        submission = None
        submission_index = -1
        
        for i, sub in enumerate(quiz.get("submissions", [])):
            if sub["student_id"] == student_obj_id:
                submission = sub
                submission_index = i
                break
                
        if not submission:
            return jsonify({"msg": "Student submission not found"}), 404
        
        # Get grading data
        data = request.get_json()
        if not data or "score" not in data:
            return jsonify({"msg": "Score is required"}), 400
        
        try:
            score = float(data["score"])
            max_score = float(data.get("maxScore", 100))
            
            if score < 0 or score > max_score:
                return jsonify({"msg": f"Score must be between 0 and {max_score}"}), 400
                
            feedback = data.get("feedback", "")
            
            # Update submission with grade
            submission["score"] = score
            submission["maxScore"] = max_score
            submission["feedback"] = feedback
            submission["isGraded"] = True
            submission["gradedAt"] = datetime.utcnow()
            submission["gradedBy"] = ObjectId(user_id)
            
            # Update the submission in the quiz
            quiz["submissions"][submission_index] = submission
            
            # Update the quiz in the database
            result = classrooms_collection.update_one(
                {"_id": ObjectId(classroom_id)},
                {"$set": {f"quizzes.$[quiz].submissions": quiz["submissions"]}},
                array_filters=[{"quiz.id": ObjectId(quiz_id)}]
            )
            
            if result.modified_count:
                return jsonify({
                    "msg": "Submission graded successfully",
                    "score": score,
                    "maxScore": max_score,
                    "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0
                }), 200
            
            return jsonify({"msg": "No changes made"}), 200
            
        except ValueError:
            return jsonify({"msg": "Invalid score value"}), 400
            
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error grading PDF submission: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/answer-pdf", methods=["GET"])
@jwt_required()
def get_student_answer_pdf(classroom_id, quiz_id, student_id):
    """Get a student's submitted answer PDF file"""
    user_id = get_jwt_identity()
    
    # Allow both the student themselves and teachers to access this endpoint
    if student_id != user_id:
        # If not the student, ensure requester is a teacher
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    else:
        # Student accessing their own submission
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
    
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find the student's submission
        student_obj_id = ObjectId(student_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == student_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "Student submission not found"}), 404
        
        # Check if submission has an answer file
        if "answerFile" not in submission:
            return jsonify({"msg": "No answer file found for this submission"}), 404
        
        # Get the file data
        file_data = submission["answerFile"]
        content = file_data.get("content")
        
        if not content:
            return jsonify({"msg": "Answer file content not found"}), 404
        
        # Set filename for download
        filename = file_data.get("filename", "student_answer.pdf")
        
        # Send the file
        response = make_response(content)
        response.headers.set("Content-Type", "application/pdf")
        response.headers.set(
            "Content-Disposition", f"attachment; filename={filename}"
        )
        return response
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving student answer PDF: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/debug", methods=["GET"])
@jwt_required()
def debug_quiz_status(classroom_id, quiz_id):
    """Debug endpoint to check quiz status and time calculations"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Get current time in UTC and convert to IST
        utc_now = datetime.utcnow()
        current_time = get_current_ist_time()
        
        # Calculate relevant times
        quiz_start = quiz["startTime"]
        quiz_end = calculate_quiz_end_time(quiz)
        
        # Check if student has submitted
        user_obj_id = ObjectId(user_id)
        has_submitted = any(
            submission["student_id"] == user_obj_id 
            for submission in quiz.get("submissions", [])
        )
        
        # Calculate time differences
        time_since_start = current_time - quiz_start
        time_until_end = quiz_end - current_time
        
        # Determine status
        quiz_status = get_quiz_status(quiz, user_obj_id, current_time)
        
        # Return debug info
        return jsonify({
            "serverTime": current_time.isoformat(),
            "serverTimeUTC": utc_now.isoformat(),
            "timezone": "IST (UTC+5:30)",
            "quizStartTime": quiz_start.isoformat(),
            "quizEndTime": quiz_end.isoformat(),
            "hasSubmitted": has_submitted,
            "studentStatus": quiz_status,
            "timeBufferInMinutes": QUIZ_TIME_BUFFER.total_seconds() / 60,
            "timeSinceStartInMinutes": time_since_start.total_seconds() / 60,
            "timeUntilEndInMinutes": time_until_end.total_seconds() / 60,
            "conditions": {
                "isBeforeStart": current_time < quiz_start - QUIZ_TIME_BUFFER,
                "isAfterEnd": current_time > quiz_end + QUIZ_TIME_BUFFER,
                "isDuringQuiz": current_time >= quiz_start - QUIZ_TIME_BUFFER and current_time <= quiz_end + QUIZ_TIME_BUFFER
            }
        }), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error debugging quiz status: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

def get_current_ist_time():
    """Helper function to get the current time in IST (UTC+5:30)"""
    utc_now = datetime.utcnow()
    ist_offset = timedelta(hours=5, minutes=30)
    return utc_now + ist_offset

@app.route("/api/classrooms/<classroom_id>/drafts", methods=["GET"])
@jwt_required()
def get_classroom_drafts(classroom_id):
    """Retrieve all announcement drafts for a classroom"""
    try:
        # Get current user ID from JWT
        user_id = get_jwt_identity()
        user_obj_id = ObjectId(user_id)
        
        # Validate classroom access
        classroom = get_classroom_and_validate_access(classroom_id, user_id, required_role="teacher")
        if not classroom:
            return jsonify({"msg": "Classroom not found or access denied"}), 404
        
        # Get drafts from the database
        drafts = list(db.drafts.find({
            "classroom_id": ObjectId(classroom_id),
            "user_id": user_obj_id
        }))
        
        # Convert drafts to JSON serializable format
        drafts_json = mongo_to_json_serializable(drafts)
        
        return jsonify({"drafts": drafts_json}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving drafts: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/drafts", methods=["POST"])
@jwt_required()
def save_classroom_draft(classroom_id):
    """Save an announcement draft for a classroom"""
    try:
        # Get current user ID from JWT
        user_id = get_jwt_identity()
        user_obj_id = ObjectId(user_id)
        
        # Validate classroom access
        classroom = get_classroom_and_validate_access(classroom_id, user_id, required_role="teacher")
        if not classroom:
            return jsonify({"msg": "Classroom not found or access denied"}), 404
        
        # Get draft data from request
        data = request.json
        if not data:
            return jsonify({"msg": "No data provided"}), 400
        
        # Create or update draft in the database
        draft = {
            "classroom_id": ObjectId(classroom_id),
            "user_id": user_obj_id,
            "draft_id": data.get("draft_id"),
            "text": data.get("text", ""),
            "attachments": data.get("attachments", []),
            "images": data.get("images", []),
            "timestamp": data.get("timestamp", datetime.utcnow().isoformat()),
            "updated_at": datetime.utcnow()
        }
        
        # Use upsert to create or update
        result = db.drafts.update_one(
            {
                "classroom_id": ObjectId(classroom_id),
                "user_id": user_obj_id,
                "draft_id": data.get("draft_id")
            },
            {"$set": draft},
            upsert=True
        )
        
        return jsonify({"msg": "Draft saved successfully", "id": data.get("draft_id")}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error saving draft: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/drafts/autosave", methods=["POST"])
@jwt_required()
def autosave_classroom_draft(classroom_id):
    """Autosave an announcement draft for a classroom"""
    try:
        # Get current user ID from JWT
        user_id = get_jwt_identity()
        user_obj_id = ObjectId(user_id)
        
        # Validate classroom access
        classroom = get_classroom_and_validate_access(classroom_id, user_id, required_role="teacher")
        if not classroom:
            return jsonify({"msg": "Classroom not found or access denied"}), 404
        
        # Get draft data from request
        data = request.json
        if not data:
            return jsonify({"msg": "No data provided"}), 400
        
        # Create or update autosave draft in the database
        draft = {
            "classroom_id": ObjectId(classroom_id),
            "user_id": user_obj_id,
            "draft_id": "autosave_draft",
            "text": data.get("text", ""),
            "attachments": data.get("attachments", []),
            "images": data.get("images", []),
            "timestamp": data.get("timestamp", datetime.utcnow().isoformat()),
            "updated_at": datetime.utcnow()
        }
        
        # Use upsert to create or update
        result = db.drafts.update_one(
            {
                "classroom_id": ObjectId(classroom_id),
                "user_id": user_obj_id,
                "draft_id": "autosave_draft"
            },
            {"$set": draft},
            upsert=True
        )
        
        return jsonify({"msg": "Draft autosaved successfully"}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error autosaving draft: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/drafts/<draft_id>", methods=["DELETE"])
@jwt_required()
def delete_classroom_draft(classroom_id, draft_id):
    """Delete an announcement draft for a classroom"""
    try:
        # Get current user ID from JWT
        user_id = get_jwt_identity()
        user_obj_id = ObjectId(user_id)
        
        # Validate classroom access
        classroom = get_classroom_and_validate_access(classroom_id, user_id, required_role="teacher")
        if not classroom:
            return jsonify({"msg": "Classroom not found or access denied"}), 404
        
        # Delete the draft
        result = db.drafts.delete_one({
            "classroom_id": ObjectId(classroom_id),
            "user_id": user_obj_id,
            "draft_id": draft_id
        })
        
        if result.deleted_count == 0:
            return jsonify({"msg": "Draft not found"}), 404
            
        return jsonify({"msg": "Draft deleted successfully"}), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error deleting draft: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

def get_submission(classroom_id, quiz_id, student_id):
    """Helper to get classroom, quiz and submission"""
    classroom, user, error = get_classroom_and_validate_access(classroom_id, get_jwt_identity(), "teacher")
    if error:
        return None, None, None
        
    quiz = find_quiz_by_id(classroom, quiz_id)
    if not quiz:
        return classroom, None, None
        
    student_obj_id = ObjectId(student_id)
    submission = None
    
    for sub in quiz.get("submissions", []):
        if sub["student_id"] == student_obj_id:
            submission = sub
            break
            
    return classroom, quiz, submission

def update_submission(classroom_id, quiz_id, student_id, updated_submission):
    """Update an existing quiz submission in the database"""
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id), "quizzes.id": ObjectId(quiz_id), "quizzes.submissions.student_id": ObjectId(student_id)},
        {"$set": {"quizzes.$.submissions.$[elem]": updated_submission}},
        array_filters=[{"elem.student_id": ObjectId(student_id)}]
    )
    return result.modified_count > 0

def extract_text_from_image(image_bytes):
    """Extract text from an image using Gemini Vision API"""
    try:
        # Generate content from image
        response = gemini_pro_vision.generate_content(
            [
                image_bytes,
                "Extract all visible text from this image. Preserve structure and formatting as much as possible. Separate paragraphs with newlines. Don't include any commentary, just return the extracted text."
            ],
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                max_output_tokens=4000,
            )
        )
        
        # Check response and return extracted text
        if response and response.text:
            return response.text
        else:
            return "No text found in the image."
    except Exception as e:
        print(f"Error in extract_text_from_image: {str(e)}")
        return f"Error extracting text: {str(e)}"

def extract_text_from_pdf(pdf_bytes):
    """
    Extract text from PDF using Google's Gemini 1.5.
    This function sends the PDF directly to the Gemini model for text extraction,
    works with both typed and handwritten content.
    """
    try:
        import tempfile
        import pathlib
        
        # Create a temporary file to save the PDF
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=True) as temp_file:
            temp_file.write(pdf_bytes)
            temp_file.flush()
            
            filepath = pathlib.Path(temp_file.name)
            
            print(f"Processing PDF using Gemini 1.5")
            prompt = "Extract all text from this document. Preserve structure and formatting as much as possible."
            
            # Send to Gemini 1.5 for processing
            # Initialize a Gemini-1.5 model
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            # Read the PDF file
            pdf_data = filepath.read_bytes()
            
            # Create contents array with PDF data and prompt
            contents = [
                {"mime_type": "application/pdf", "data": pdf_data},
                prompt
            ]
            
            # Generate content
            response = model.generate_content(contents)
            
            # Check if we got a valid response
            if response and response.text:
                print(f"Successfully extracted {len(response.text)} characters using Gemini 1.5")
                return response.text
            else:
                print("Gemini extraction returned empty text.")
                return "No text was extracted from the PDF."
                
    except Exception as e:
        print(f"Error extracting text from PDF with Gemini: {str(e)}")
        return f"Error extracting text from PDF: {str(e)}"

def segregate_questions_by_number(extracted_text, is_question_paper=True):
    """
    Use Gemini to segregate questions by number from extracted text.
    For question papers or solution scripts, this identifies individual questions
    and returns them in a structured format.
    
    Args:
        extracted_text (str): The text extracted from the PDF
        is_question_paper (bool): Whether this is a question paper or a student answer
    
    Returns:
        dict: A dictionary where keys are question numbers and values are the text of each question
    """
    try:
        print(f"Segregating {'questions' if is_question_paper else 'answers'} by number...")
        
        # Prepare prompt for Gemini
        if is_question_paper:
            prompt = """
            I have extracted text from a question paper. Please help me segregate the questions by their numbers.
            Identify each question by its number (like "1.", "2.", "Question 1", etc.) and split the text accordingly.
            
            Return the result as a valid JSON object where:
            - Keys are the question numbers as strings (e.g., "1", "2", "3")
            - Values are the complete text of each question
            
            If parts of the text don't belong to any numbered question (like instructions or headers), 
            include them under key "0" as "preamble".
            
            Here's the extracted text:
            
            """
        else:
            prompt = """
            I have extracted text from a student's answer or solution script. Please help me segregate the answers by question numbers.
            Identify each answer by its corresponding question number (like "1.", "2.", "Answer 1", etc.) and split the text accordingly.
            
            Return the result as a valid JSON object where:
            - Keys are the question numbers as strings (e.g., "1", "2", "3")
            - Values are the complete text of each answer
            
            If parts of the text don't belong to any numbered answer (like notes or headers), 
            include them under key "0" as "notes".
            
            Here's the extracted text:
            
            """
            
        prompt += extracted_text
        
        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Call Gemini with the prompt
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                top_p=0.95,
                top_k=0,
                max_output_tokens=8192,
            )
        )
        
        # Extract JSON from response
        response_text = response.text
        print("Received response from Gemini for question segregation")
        
        # Find JSON in the response (it might be surrounded by markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            response_text = json_match.group(1)
        
        result = json.loads(response_text)
        
        # Print the segregated questions
        print(f"Successfully segregated questions into {len(result)} sections")
        for q_num, q_text in result.items():
            if q_num == "0":
                print(f"Preamble/Notes ({len(q_text)} characters)")
            else:
                print(f"Question {q_num} ({len(q_text)} characters)")
                if len(q_text) > 100:
                    print(f"Preview: {q_text[:100]}...")
                else:
                    print(f"Content: {q_text}")
        
        return result
        
    except Exception as e:
        print(f"Error segregating questions: {str(e)}")
        traceback.print_exc()
        # Return the original text as a single item if segregation fails
        return {"0": extracted_text}

def map_answers_to_questions(extracted_texts, questions):
    """Map extracted text to exam questions"""
    combined_text = " ".join(extracted_texts)
    app.logger.info(f"Mapping {len(extracted_texts)} extracted text segments to {len(questions)} questions")
    
    # Limit the text size if it's too large
    if len(combined_text) > 20000:
        app.logger.warning(f"Extracted text is very large ({len(combined_text)} chars), truncating to 20000 chars")
        combined_text = combined_text[:20000]
    
    # Use Gemini to map answers to questions
    prompt = f"""
    I have the following exam questions:
    {json.dumps(questions, indent=2)}
    
    And the following extracted text from a student's exam:
    {combined_text}
    
    For each question, extract the student's answer. Return a JSON array where each object has:
    1. question_id: The ID of the question
    2. student_answer: The student's answer for this question
    
    Return ONLY valid JSON.
    """
    
    generation_config = {
        "temperature": 0.0,
        "top_p": 0.95,
        "top_k": 0,
        "max_output_tokens": 8192,
    }
    
    try:
        app.logger.info("Calling Gemini API to map answers to questions")
        response = gemini_model.generate_content(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=generation_config
        )
        
        # Extract JSON from response
        response_text = response.text
        app.logger.info("Successfully received response from Gemini API")
        
        # Find JSON in the response (it might be surrounded by markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            response_text = json_match.group(1)
        
        result = json.loads(response_text)
        app.logger.info(f"Successfully mapped {len(result)} answers")
        return result
    
    except Exception as e:
        app.logger.error(f"Error mapping answers to questions: {str(e)}")
        
        # Try a simpler approach as a fallback
        try:
            app.logger.info("Trying fallback approach for mapping answers")
            
            # If the original attempt failed, try a simpler approach
            fallback_results = []
            
            for question in questions:
                question_id = str(question["id"])
                question_text = question["text"]
                
                # Look for the question text in the combined text and extract what follows
                question_pattern = re.escape(question_text)
                match = re.search(f"{question_pattern}[\\s\\:]+([\\s\\S]+?)(?=\\b(?:{'|'.join([re.escape(q['text']) for q in questions if q['text'] != question_text])})|$)", combined_text)
                
                if match:
                    answer = match.group(1).strip()
                else:
                    answer = "Unable to extract answer for this question"
                
                fallback_results.append({
                    "question_id": question_id,
                    "student_answer": answer
                })
            
            app.logger.info(f"Fallback approach found {len(fallback_results)} answers")
            return fallback_results
            
        except Exception as fallback_error:
            app.logger.error(f"Fallback approach also failed: {str(fallback_error)}")
            return []

def grade_answer(question, student_answer, model_answer, max_score):
    """Grade a single answer using Gemini"""
    app.logger.info(f"Grading answer for question: {question[:50]}...")
    
    # Limit the size of text to prevent API issues
    if len(student_answer) > 5000:
        app.logger.warning(f"Student answer is very large ({len(student_answer)} chars), truncating to 5000 chars")
        student_answer = student_answer[:5000] + "... [truncated due to length]"
        
    if len(model_answer) > 5000:
        app.logger.warning(f"Model answer is very large ({len(model_answer)} chars), truncating to 5000 chars")
        model_answer = model_answer[:5000] + "... [truncated due to length]"
    
    prompt = f"""
    You are an expert exam grader. Grade the following student answer:
    
    QUESTION: {question}
    MODEL ANSWER: {model_answer}
    STUDENT ANSWER: {student_answer}
    MAXIMUM SCORE: {max_score}
    
    Return your response in valid JSON format with these fields:
    1. score (number between 0 and {max_score})
    2. feedback (detailed explanation of why points were given or deducted)
    3. key_points_addressed (array of important points the student covered)
    4. key_points_missed (array of important points the student missed)
    
    Return ONLY valid JSON.
    """
    
    generation_config = {
        "temperature": 0.0,
        "top_p": 0.95,
        "top_k": 0,
        "max_output_tokens": 8192,
    }
    
    try:
        app.logger.info("Calling Gemini API to grade answer")
        response = gemini_model.generate_content(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=generation_config
        )
        
        # Extract JSON from response
        response_text = response.text
        app.logger.info("Successfully received grading response from Gemini API")
        
        # Find JSON in the response (it might be surrounded by markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            response_text = json_match.group(1)
        
        result = json.loads(response_text)
        # Ensure the score is a number within the allowed range
        result["score"] = max(0, min(float(result["score"]), max_score))
        return result
        
    except Exception as e:
        app.logger.error(f"Error grading answer: {str(e)}")
        
        # Attempt a fallback with a simpler prompt
        try:
            app.logger.info("Trying fallback approach for grading")
            fallback_prompt = f"""
            Question: {question}
            Student answer: {student_answer}
            
            Grade this answer out of {max_score} points. Return JSON with fields:
            - score: a number between 0 and {max_score}
            - feedback: brief explanation
            - key_points_addressed: list of key points the student included
            - key_points_missed: list of key points the student missed
            
            JSON ONLY.
            """
            
            response = gemini_model.generate_content(
                contents=[{"role": "user", "parts": [{"text": fallback_prompt}]}]
            )
            
            response_text = response.text
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                response_text = json_match.group(1)
                
            fallback_result = json.loads(response_text)
            fallback_result["score"] = max(0, min(float(fallback_result["score"]), max_score))
            return fallback_result
            
        except Exception as fallback_error:
            app.logger.error(f"Fallback grading also failed: {str(fallback_error)}")
            
            # Use a very basic fallback with default values
            return {
                "score": 0,
                "feedback": f"Error grading answer: {str(e)}",
                "key_points_addressed": [],
                "key_points_missed": []
            }

def grade_all_answers(mapped_answers, quiz_questions, model_answers):
    """Grade all answers for a quiz"""
    graded_answers = []
    total_score = 0
    max_total = 0
    
    for answer in mapped_answers:
        question_id = answer["question_id"]
        student_answer = answer["student_answer"]
        
        # Find the corresponding question and model answer
        question_info = next((q for q in quiz_questions if str(q["id"]) == question_id), None)
        if not question_info:
            continue
            
        question_text = question_info["text"]
        max_score = question_info.get("points", 10)
        max_total += max_score
        
        # Get model answer for this question
        model_answer = next((m["answer"] for m in model_answers if str(m["question_id"]) == question_id), "")
        
        # Grade the answer
        grading_result = grade_answer(question_text, student_answer, model_answer, max_score)
        
        # Add question text to result for frontend display
        grading_result["question_text"] = question_text
        grading_result["question_id"] = question_id
        grading_result["student_answer"] = student_answer
        
        graded_answers.append(grading_result)
        total_score += grading_result["score"]
    
    return {
        "graded_answers": graded_answers,
        "total_score": total_score,
        "max_total": max_total,
        "percentage": round((total_score / max_total * 100) if max_total > 0 else 0, 2)
    }

@app.route("/api/teacher/grade_pdf_advanced", methods=["POST"])
@jwt_required()
def advanced_pdf_grading():
    """Process a student PDF submission with OCR and grade it question by question"""
    try:
        data = request.json
        classroom_id = data.get("classId")
        quiz_id = data.get("quizId")
        student_id = data.get("studentId")
        
        app.logger.info(f"Advanced PDF grading request: Class: {classroom_id}, Quiz: {quiz_id}, Student: {student_id}")
        
        # Get classroom, quiz and submission
        classroom, quiz, submission = get_submission(classroom_id, quiz_id, student_id)
        
        if not classroom or not quiz:
            return jsonify({"error": "Invalid classroom or quiz ID"}), 400
            
        if not submission:
            return jsonify({"error": "No submission found for this student"}), 404
        
        # Check if we already have advanced grading results to avoid reprocessing
        if submission.get("advanced_grading") and submission.get("advanced_grading_status") == "completed":
            app.logger.info(f"Returning cached advanced grading results for submission")
            return jsonify({
                "message": "Retrieved cached advanced grading results",
                "grading_results": submission.get("advanced_grading"),
                "cached": True
            })
        
        # Update status to indicate processing has started
        submission["advanced_grading_status"] = "processing"
        update_submission(classroom_id, quiz_id, student_id, submission)
        
        # Get PDF file from submission
        pdf_file_id = submission.get("pdf_file_id")
        if not pdf_file_id:
            return jsonify({"error": "No PDF submission found"}), 404
            
        # Get the PDF file
        pdf_file = fs.get(ObjectId(pdf_file_id))
        pdf_bytes = pdf_file.read()
        
        # Get quiz questions
        quiz_questions = quiz.get("questions", [])
        if not quiz_questions:
            return jsonify({"error": "No questions found for this quiz"}), 400
            
        # Get model answers
        model_answers = quiz.get("model_answers", [])
        
        app.logger.info(f"Starting OCR processing for PDF with {len(quiz_questions)} questions")
        
        # Step 1: Process PDF and extract text using OCR
        extracted_texts = extract_text_from_pdf(pdf_bytes)
        if not extracted_texts:
            submission["advanced_grading_status"] = "failed"
            submission["advanced_grading_error"] = "Failed to extract text from PDF"
            update_submission(classroom_id, quiz_id, student_id, submission)
            return jsonify({"error": "Failed to extract text from PDF"}), 500
            
        app.logger.info(f"Successfully extracted text from {len(extracted_texts)} PDF pages")
        
        # Step 2: Map extracted text to questions
        mapped_answers = map_answers_to_questions(extracted_texts, quiz_questions)
        if not mapped_answers:
            submission["advanced_grading_status"] = "failed"
            submission["advanced_grading_error"] = "Failed to map answers to questions"
            update_submission(classroom_id, quiz_id, student_id, submission)
            return jsonify({"error": "Failed to map answers to questions"}), 500
            
        app.logger.info(f"Successfully mapped answers to {len(mapped_answers)} questions")
        
        # Step 3: Grade each answer
        grading_results = grade_all_answers(mapped_answers, quiz_questions, model_answers)
        
        # Step 4: Save results to submission
        submission["advanced_grading"] = grading_results
        submission["advanced_grading_status"] = "completed"
        submission["advanced_grading_timestamp"] = datetime.datetime.utcnow()
        
        # Update submission in database
        success = update_submission(classroom_id, quiz_id, student_id, submission)
        if not success:
            return jsonify({"error": "Failed to update submission"}), 500
            
        app.logger.info(f"Advanced grading completed successfully with score: {grading_results['total_score']}/{grading_results['max_total']}")
        
        return jsonify({
            "message": "Advanced grading completed successfully",
            "grading_results": grading_results
        })
        
    except Exception as e:
        app.logger.error(f"Error in advanced PDF grading: {str(e)}")
        traceback.print_exc()
        
        # Try to update submission status if classroom_id, quiz_id and student_id are defined
        try:
            if 'classroom_id' in locals() and 'quiz_id' in locals() and 'student_id' in locals() and 'submission' in locals():
                submission["advanced_grading_status"] = "failed"
                submission["advanced_grading_error"] = str(e)
                update_submission(classroom_id, quiz_id, student_id, submission)
        except:
            pass
            
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route("/api/teacher/model_answers", methods=["POST"])
@jwt_required()
def set_model_answers():
    """Save model answers for a quiz"""
    try:
        data = request.json
        classroom_id = data.get("classId")
        quiz_id = data.get("quizId")
        model_answers = data.get("modelAnswers", [])
        
        # Validate classroom and quiz
        classroom, user, error = get_classroom_and_validate_access(classroom_id, get_jwt_identity(), "teacher")
        if error:
            return jsonify({"error": error}), 401
            
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"error": "Quiz not found"}), 404
            
        # Update quiz with model answers
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id)},
            {"$set": {f"quizzes.$[quiz].model_answers": model_answers}},
            array_filters=[{"quiz.id": ObjectId(quiz_id)}]
        )
        
        if result.modified_count == 0:
            return jsonify({"error": "Failed to update model answers"}), 500
            
        return jsonify({"message": "Model answers saved successfully"})
        
    except Exception as e:
        app.logger.error(f"Error setting model answers: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/pdf-to-text", methods=["POST"])
@jwt_required()
def convert_quiz_pdf_to_text(classroom_id, quiz_id):
    """Simple endpoint to convert quiz PDFs to text using Gemini and save to DB"""
    try:
        # This function is being removed as we now extract text automatically during quiz creation
        return jsonify({"error": "This endpoint is deprecated. PDFs are now automatically processed during quiz creation."}), 410
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

def process_classroom_quizzes_pdfs(classroom_id):
    """Process all quizzes in a classroom, converting PDFs to text if needed"""
    try:
        # Find the classroom
        classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
        if not classroom:
            print(f"Classroom not found: {classroom_id}")
            return {"success": False, "message": "Classroom not found"}
        
        print(f"\n===== PROCESSING ALL QUIZZES IN CLASSROOM: {classroom.get('name', 'Unknown')} =====")
        
        # Check if classroom has quizzes
        if not classroom.get("quizzes"):
            print("No quizzes found in classroom")
            return {"success": True, "processed": 0, "already_processed": 0, "errors": 0, "message": "No quizzes found in classroom"}
        
        processed_count = 0
        already_processed_count = 0
        error_count = 0
        
        # Iterate through quizzes
        for quiz in classroom["quizzes"]:
            quiz_id = str(quiz["id"])
            title = quiz.get("title", "Untitled Quiz")
            print(f"\nProcessing quiz: {title} (ID: {quiz_id})")
            
            # Skip if already processed
            if quiz.get("extractedText"):
                print(f"Quiz already has extracted text (processed on {quiz['extractedText'].get('timestamp', 'unknown date')})")
                already_processed_count += 1
                continue
            
            pdf_processed = False
            # Check for question paper PDF
            if quiz.get("questionPaper") and "content" in quiz.get("questionPaper", {}):
                try:
                    print(f"Found question paper PDF: {quiz['questionPaper'].get('filename', 'unnamed')}")
                    
                    # Extract question paper PDF content
                    pdf_binary = quiz["questionPaper"]["content"]
                    
                    # Use the more robust text extraction method
                    print("Extracting text from question paper PDF...")
                    question_paper_text = extract_text_from_pdf(pdf_binary)
                    
                    # Process answer key PDF if available
                    answer_key_text = None
                    if quiz.get("answerKey") and "content" in quiz.get("answerKey", {}):
                        print(f"\nFound answer key PDF: {quiz['answerKey'].get('filename', 'unnamed')}")
                        
                        # Extract answer key PDF content
                        answer_key_binary = quiz["answerKey"]["content"]
                        
                        # Use the more robust text extraction method
                        print("Extracting text from answer key PDF...")
                        answer_key_text = extract_text_from_pdf(answer_key_binary)
                    
                    # Save extracted text to database
                    extracted_text = {
                        "timestamp": datetime.utcnow()
                    }
                    
                    if question_paper_text:
                        extracted_text["questionPaper"] = [question_paper_text]
                        
                    if answer_key_text:
                        extracted_text["answerKey"] = [answer_key_text]
                    
                    # Check if we have any text to save
                    if "questionPaper" in extracted_text or "answerKey" in extracted_text:
                        print("\nSaving extracted text to database...")
                        
                        result = classrooms_collection.update_one(
                            {"_id": ObjectId(classroom_id), "quizzes.id": ObjectId(quiz_id)},
                            {"$set": {"quizzes.$.extractedText": extracted_text}}
                        )
                        
                        if result.modified_count == 1:
                            print("Text extraction saved to database successfully")
                            processed_count += 1
                            pdf_processed = True
                        else:
                            print("Warning: Failed to save text extraction to database")
                            error_count += 1
                    else:
                        print("No text was extracted from either PDF")
                        error_count += 1
                        
                except Exception as e:
                    print(f"Error extracting text from PDF: {str(e)}")
                    traceback.print_exc()
                    error_count += 1
            else:
                print("No PDF found or PDF content is missing")
                error_count += 1
            
            print(f"Quiz processing {'COMPLETED' if pdf_processed else 'FAILED'}\n")
        
        # Print summary
        print("\n===== PDF TEXT EXTRACTION SUMMARY =====")
        print(f"Total quizzes processed: {processed_count}")
        print(f"Total quizzes already processed: {already_processed_count}")
        print(f"Total quizzes with errors: {error_count}")
        print("===== PDF TEXT EXTRACTION COMPLETE =====\n")
        
        return {
            "success": True,
            "processed": processed_count,
            "already_processed": already_processed_count,
            "errors": error_count,
            "message": f"Processed {processed_count} quizzes, {already_processed_count} already had text, {error_count} errors"
        }
        
    except Exception as e:
        print(f"ERROR processing classroom quizzes: {str(e)}")
        traceback.print_exc()
        return {"success": False, "message": f"Server error: {str(e)}"}

@app.route("/api/classrooms/<classroom_id>/process-pdfs", methods=["POST"])
@jwt_required()
def process_classroom_pdfs_endpoint(classroom_id):
    """Endpoint to trigger processing of all PDFs in a classroom's quizzes"""
    user_id = get_jwt_identity()
    
    # Validate teacher access
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return jsonify({"msg": error}), 401
    
    # Process PDFs
    try:
        result = process_classroom_quizzes_pdfs(classroom_id)
        
        if isinstance(result, dict):
            # New format with detailed information
            if result.get("success", False):
                return jsonify({
                    "msg": result.get("message", "PDF processing completed"),
                    "processed": result.get("processed", 0),
                    "already_processed": result.get("already_processed", 0),
                    "errors": result.get("errors", 0)
                }), 200
            else:
                return jsonify({"msg": result.get("message", "Error processing PDFs")}), 500
        else:
            # Old boolean format for backward compatibility
            if result:
                return jsonify({"msg": "PDF processing completed successfully"}), 200
            else:
                return jsonify({"msg": "Error processing PDFs"}), 500
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

    # Return as a list for compatibility with existing code
    return [img]

@jwt_required()
def get_submission_extracted_text(classroom_id, quiz_id, student_id):
    """
    Get the full extracted text from a student's PDF submission.
    
    This endpoint retrieves the text that was automatically extracted from the student's
    PDF submission using Google's Gemini 1.5 AI model. The text extraction makes
    handwritten and typed content searchable and accessible.
    
    This endpoint can be accessed by:
    1. The teacher of the classroom
    2. The student who submitted the quiz (can only access their own submission)
    """
    user_id = get_jwt_identity()
    
    # Check if user is a teacher for this classroom or the student who submitted
    is_teacher = False
    is_owner = (user_id == student_id)
    
    if not is_owner:
        # If not the owner, must be a teacher
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
        if error:
            return error
        is_teacher = True
    else:
        # Student accessing their own submission
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
        if error:
            return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find student's submission
        student_obj_id = ObjectId(student_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == student_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "Submission not found"}), 404
        
        # Check if text was extracted
        if "extractedText" not in submission:
            if "extractionError" in submission:
                return jsonify({
                    "msg": "Text extraction failed",
                    "error": submission["extractionError"]
                }), 400
            else:
                return jsonify({"msg": "No extracted text available for this submission"}), 404
        
        # Get student info for teachers
        student_info = {}
        if is_teacher:
            student = users_collection.find_one({"_id": student_obj_id})
            if student:
                student_info = {
                    "name": student.get("fullName", "Unknown"),
                    "email": student.get("email", "")
                }
        
        # Return the extracted text
        response_data = {
            "quizTitle": quiz.get("title", "Untitled Quiz"),
            "studentInfo": student_info,
            "extractedText": submission["extractedText"],
            "submissionDate": submission.get("endTime", "").isoformat() if isinstance(submission.get("endTime"), datetime) else submission.get("endTime", ""),
            "textLength": len(submission["extractedText"])
        }
        
        # Add segregated answers if available
        if "segregatedAnswers" in submission:
            response_data["segregatedAnswers"] = submission["segregatedAnswers"]
            response_data["questionCount"] = len(submission["segregatedAnswers"]) - (1 if "0" in submission["segregatedAnswers"] else 0)
        
        return jsonify(response_data), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving extracted text: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/segregated-questions", methods=["GET"])
@jwt_required()
def get_segregated_quiz_questions(classroom_id, quiz_id):
    """
    Get segregated questions from a quiz.
    
    This endpoint retrieves the questions that were automatically segregated from
    the quiz's PDF question paper using Gemini. It returns the questions organized
    by question number.
    """
    user_id = get_jwt_identity()
    
    # Check if user has access to this classroom
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Check if quiz has extracted and segregated text
        if not quiz.get("extractedText") or not quiz["extractedText"].get("segregatedQuestions"):
            return jsonify({
                "msg": "This quiz does not have segregated questions",
                "hasExtractedText": "extractedText" in quiz,
                "hasPDF": "questionPaper" in quiz
            }), 404
        
        # Get the segregated questions
        segregated_questions = quiz["extractedText"]["segregatedQuestions"]
        
        # Create a response with quiz metadata and segregated questions
        response_data = {
            "quizTitle": quiz.get("title", "Untitled Quiz"),
            "quizDescription": quiz.get("description", ""),
            "questionCount": len(segregated_questions) - (1 if "0" in segregated_questions else 0),
            "segregatedQuestions": segregated_questions
        }
        
        # Include answer key info if user is teacher
        is_teacher = classroom["teacher_id"] == ObjectId(user_id)
        if is_teacher and "extractedText" in quiz and "segregatedAnswers" in quiz["extractedText"]:
            response_data["hasAnswerKey"] = True
        else:
            response_data["hasAnswerKey"] = False
        
        return jsonify(response_data), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving segregated questions: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/segregated-answer-key", methods=["GET"])
@jwt_required()
def get_segregated_answer_key(classroom_id, quiz_id):
    """
    Get segregated answer key from a quiz (teacher only).
    
    This endpoint retrieves the solution answers that were automatically segregated
    from the quiz's answer key PDF using Gemini. It returns the answers organized
    by question number.
    """
    user_id = get_jwt_identity()
    
    # Only teachers can access the answer key
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Check if quiz has extracted and segregated answer key
        if not quiz.get("extractedText") or not quiz["extractedText"].get("segregatedAnswers"):
            return jsonify({
                "msg": "This quiz does not have a segregated answer key",
                "hasExtractedText": "extractedText" in quiz,
                "hasAnswerKey": "answerKey" in quiz
            }), 404
        
        # Get the segregated answer key
        segregated_answers = quiz["extractedText"]["segregatedAnswers"]
        
        # Create a response with quiz metadata and segregated answer key
        response_data = {
            "quizTitle": quiz.get("title", "Untitled Quiz"),
            "quizDescription": quiz.get("description", ""),
            "answerCount": len(segregated_answers) - (1 if "0" in segregated_answers else 0),
            "segregatedAnswers": segregated_answers
        }
        
        # Include link to questions
        response_data["questionsLink"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/segregated-questions"
        
        return jsonify(response_data), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving segregated answer key: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/segregated-answers", methods=["GET"])
@jwt_required()
def get_segregated_student_answers(classroom_id, quiz_id, student_id):
    """
    Get segregated answers from a student's submission.
    
    This endpoint retrieves the answers that were automatically segregated from
    the student's submission PDF using Gemini. It returns the answers organized
    by question number.
    
    This endpoint can be accessed by:
    1. The teacher of the classroom
    2. The student who submitted the quiz (can only access their own submission)
    """
    user_id = get_jwt_identity()
    
    # Check if user is a teacher for this classroom or the student who submitted
    is_teacher = False
    is_owner = (user_id == student_id)
    
    if not is_owner:
        # If not the owner, must be a teacher
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
        if error:
            return error
        is_teacher = True
    else:
        # Student accessing their own submission
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
        if error:
            return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find student's submission
        student_obj_id = ObjectId(student_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == student_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "Submission not found"}), 404
        
        # Check if submission has segregated answers
        if "segregatedAnswers" not in submission:
            if "extractedText" not in submission:
                return jsonify({"msg": "No extracted text available for this submission"}), 404
            elif "extractionError" in submission:
                return jsonify({
                    "msg": "Text extraction failed",
                    "error": submission["extractionError"]
                }), 400
            else:
                return jsonify({"msg": "This submission does not have segregated answers"}), 404
        
        # Get student info for teachers
        student_info = {}
        if is_teacher:
            student = users_collection.find_one({"_id": student_obj_id})
            if student:
                student_info = {
                    "name": student.get("fullName", "Unknown"),
                    "email": student.get("email", "")
                }
        
        # Get the quiz questions for comparison
        has_questions = quiz.get("extractedText") and quiz["extractedText"].get("segregatedQuestions")
        
        # Create response
        response_data = {
            "quizTitle": quiz.get("title", "Untitled Quiz"),
            "studentInfo": student_info,
            "submissionDate": submission.get("endTime", "").isoformat() if isinstance(submission.get("endTime"), datetime) else submission.get("endTime", ""),
            "answerCount": len(submission["segregatedAnswers"]) - (1 if "0" in submission["segregatedAnswers"] else 0),
            "segregatedAnswers": submission["segregatedAnswers"],
            "hasQuestions": has_questions
        }
        
        # For teachers, include question-answer matching data
        if is_teacher and has_questions:
            # Include a comparison of questions and answers
            question_answer_mapping = []
            segregated_questions = quiz["extractedText"]["segregatedQuestions"]
            
            # Remove preambles (key "0")
            question_keys = [k for k in segregated_questions.keys() if k != "0"]
            answer_keys = [k for k in submission["segregatedAnswers"].keys() if k != "0"]
            
            # Match questions with answers
            for q_key in sorted(question_keys, key=lambda x: int(x) if x.isdigit() else float('inf')):
                matching = {
                    "questionNumber": q_key,
                    "questionText": segregated_questions[q_key],
                    "hasAnswer": q_key in submission["segregatedAnswers"],
                }
                
                if q_key in submission["segregatedAnswers"]:
                    matching["answerText"] = submission["segregatedAnswers"][q_key]
                
                question_answer_mapping.append(matching)
            
            # Check for answers without matching questions
            for a_key in sorted(answer_keys, key=lambda x: int(x) if x.isdigit() else float('inf')):
                if a_key not in segregated_questions:
                    question_answer_mapping.append({
                        "questionNumber": a_key,
                        "questionText": "No matching question found",
                        "hasAnswer": True,
                        "answerText": submission["segregatedAnswers"][a_key],
                        "unmatchedAnswer": True
                    })
            
            response_data["questionAnswerMapping"] = question_answer_mapping
            
            # Add answer key link if available
            if "extractedText" in quiz and "segregatedAnswers" in quiz["extractedText"]:
                response_data["answerKeyLink"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/segregated-answer-key"
        
        return jsonify(response_data), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving segregated student answers: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

def grade_student_answer_by_question(student_answer, model_answer, question_number, max_marks=20):
    """
    Use Gemini to grade a student's answer for a specific question by comparing it to the model answer.
    
    Args:
        student_answer (str): The student's answer text
        model_answer (str): The model/correct answer text from the teacher
        question_number (str): The question number being graded
        max_marks (int): Maximum marks for this question (default: 20)
        
    Returns:
        dict: Grading result with score, feedback, and analysis
    """
    try:
        print(f"Grading question {question_number} using Gemini...")
        
        # Prepare the prompt for Gemini
        prompt = f"""
        You are an expert educator grading a student's answer to an exam question.
        
        Question Number: {question_number}
        
        MODEL ANSWER (correct solution):
        {model_answer}
        
        STUDENT'S ANSWER:
        {student_answer}
        
        Please evaluate the student's answer based on the model answer. The question is worth {max_marks} marks.
        
        Assign a score out of {max_marks} based on correctness, completeness, and clarity.
        Provide brief, constructive feedback explaining the grading decision.
        
        Return your evaluation as a valid JSON object with these fields:
        - score: The numerical score (between 0 and {max_marks})
        - feedback: Brief explanation of the grade (1-3 sentences)
        - key_points_addressed: List of important points from the model answer that the student covered
        - key_points_missed: List of important points from the model answer that the student missed
        - improvement_suggestions: Brief suggestions for improvement
        
        Be fair but thorough in your assessment.
        """
        
        # Generate grading using Gemini
        response = gemini_model.generate_content(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                top_p=0.95,
                top_k=40,
                max_output_tokens=8192,
            )
        )
        
        # Extract and parse JSON from response
        response_text = response.text
        print(f"Received grading response from Gemini for question {question_number}")
        
        # Find JSON in the response (it might be surrounded by markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            response_text = json_match.group(1)
        
        result = json.loads(response_text)
        
        # Ensure the score is within bounds
        result["score"] = max(0, min(max_marks, result["score"]))
        
        print(f"Question {question_number} grading complete: {result['score']}/{max_marks}")
        return result
        
    except Exception as e:
        print(f"Error grading question {question_number}: {str(e)}")
        traceback.print_exc()
        
        # Return a basic result if grading fails
        return {
            "score": 0,
            "feedback": f"Error during automated grading: {str(e)}",
            "error": str(e),
            "grading_failed": True
        }

def auto_grade_submission(quiz, submission):
    """
    Automatically grade a student submission using Gemini by comparing segregated 
    answers to the teacher's answer key.
    
    Args:
        quiz (dict): The quiz object containing answer key
        submission (dict): The student's submission with segregated answers
        
    Returns:
        dict: Updated submission with grading results
    """
    print(f"Starting auto-grading for student submission...")
    
    # Make a copy of the submission to avoid modifying the original
    graded_submission = submission.copy()
    
    # Check if we have the necessary data for grading
    if not quiz.get("extractedText") or not quiz["extractedText"].get("segregatedAnswers"):
        print("Cannot grade: Quiz does not have segregated answer key")
        graded_submission["autoGradingError"] = "Quiz does not have segregated answer key"
        return graded_submission
        
    if not submission.get("segregatedAnswers"):
        print("Cannot grade: Student submission does not have segregated answers")
        graded_submission["autoGradingError"] = "Submission does not have segregated answers"
        return graded_submission
    
    # Get the model answers (teacher's answer key)
    model_answers = quiz["extractedText"]["segregatedAnswers"]
    
    # Get the student's answers
    student_answers = submission["segregatedAnswers"]
    
    # Initialize grading
    total_score = 0
    max_score = 0
    graded_questions = {}
    question_grading_results = []
    
    # Get all unique question numbers across both model and student answers
    # Skip the preamble/notes (key "0")
    all_question_numbers = set(
        [k for k in model_answers.keys() if k != "0"] +
        [k for k in student_answers.keys() if k != "0"]
    )
    
    print(f"Found {len(all_question_numbers)} questions to grade")
    
    # Grade each question
    for question_number in sorted(all_question_numbers, key=lambda x: int(x) if x.isdigit() else float('inf')):
        # Skip if it's the preamble (key "0")
        if question_number == "0":
            continue
            
        model_answer = model_answers.get(question_number, "")
        student_answer = student_answers.get(question_number, "")
        
        if not model_answer:
            print(f"Warning: No model answer for question {question_number}")
            continue
            
        if not student_answer:
            print(f"Student did not answer question {question_number}")
            # Create an empty grading result for unanswered questions
            grading_result = {
                "questionNumber": question_number,
                "score": 0,
                "maxScore": 20,
                "feedback": "No answer provided for this question.",
                "key_points_addressed": [],
                "key_points_missed": ["All points missed - no answer provided"],
                "improvement_suggestions": ["Please provide an answer to this question."],
                "answered": False
            }
        else:
            # Grade this answer using Gemini
            grading_result = grade_student_answer_by_question(
                student_answer=student_answer,
                model_answer=model_answer,
                question_number=question_number,
                max_marks=20  # Each question is worth 20 marks
            )
            
            # Add question metadata
            grading_result["questionNumber"] = question_number
            grading_result["maxScore"] = 20
            grading_result["answered"] = True
            
            # Update total score
            total_score += grading_result["score"]
            
        # Add to results
        max_score += 20
        graded_questions[question_number] = grading_result
        question_grading_results.append(grading_result)
    
    # Calculate overall results
    overall_percentage = (total_score / max_score * 100) if max_score > 0 else 0
    
    # Update the submission with grading results
    graded_submission["score"] = total_score
    graded_submission["maxScore"] = max_score
    graded_submission["percentage"] = round(overall_percentage, 1)
    graded_submission["isGraded"] = True
    graded_submission["gradedQuestions"] = graded_questions
    graded_submission["questionGradingResults"] = question_grading_results
    graded_submission["autoGraded"] = True
    graded_submission["gradedAt"] = datetime.utcnow()
    
    # Generate overall feedback
    if len(question_grading_results) > 0:
        overall_feedback = f"You scored {total_score} out of {max_score} ({round(overall_percentage, 1)}%). "
        
        if overall_percentage >= 90:
            overall_feedback += "Excellent work! You demonstrated a comprehensive understanding of the material."
        elif overall_percentage >= 80:
            overall_feedback += "Very good work. You showed strong knowledge with a few areas for improvement."
        elif overall_percentage >= 70:
            overall_feedback += "Good work. You've grasped most concepts, but there are some areas to strengthen."
        elif overall_percentage >= 60:
            overall_feedback += "Satisfactory work. You've understood the basic concepts, but need to develop deeper understanding."
        elif overall_percentage >= 50:
            overall_feedback += "You've met minimum requirements, but need significant improvement in understanding key concepts."
        else:
            overall_feedback += "You need to review the material more thoroughly and improve your understanding of key concepts."
    else:
        overall_feedback = "Your submission could not be fully graded automatically."
    
    graded_submission["feedback"] = overall_feedback
    
    print(f"Auto-grading complete: Score {total_score}/{max_score} ({round(overall_percentage, 1)}%)")
    return graded_submission

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/grading", methods=["GET"])
@jwt_required()
def get_submission_grading_details(classroom_id, quiz_id, student_id):
    """
    Get detailed grading results for a student's quiz submission.
    
    This endpoint retrieves the question-by-question grading generated by Gemini AI
    for a student's submission, including scores, feedback, and analysis for each answer.
    
    This endpoint can be accessed by:
    1. The teacher of the classroom
    2. The student who submitted the quiz (can only access their own submission)
    """
    user_id = get_jwt_identity()
    
    # Check if user is a teacher for this classroom or the student who submitted
    is_teacher = False
    is_owner = (user_id == student_id)
    
    if not is_owner:
        # If not the owner, must be a teacher
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
        if error:
            return error
        is_teacher = True
    else:
        # Student accessing their own submission
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
        if error:
            return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Find student's submission
        student_obj_id = ObjectId(student_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == student_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "Submission not found"}), 404
        
        # Check if submission has been auto-graded
        if not submission.get("autoGraded", False) or not submission.get("isGraded", False):
            return jsonify({"msg": "This submission has not been auto-graded"}), 404
            
        if "questionGradingResults" not in submission:
            return jsonify({"msg": "No question-by-question grading results available"}), 404
        
        # Get student info for teachers
        student_info = {}
        if is_teacher:
            student = users_collection.find_one({"_id": student_obj_id})
            if student:
                student_info = {
                    "name": student.get("fullName", "Unknown"),
                    "email": student.get("email", "")
                }
        
        # Get quiz questions and answer key if available
        has_questions = quiz.get("extractedText") and quiz["extractedText"].get("segregatedQuestions")
        has_answer_key = quiz.get("extractedText") and quiz["extractedText"].get("segregatedAnswers")
        
        # Create response
        response_data = {
            "quizTitle": quiz.get("title", "Untitled Quiz"),
            "studentInfo": student_info,
            "submissionDate": submission.get("endTime", "").isoformat() if isinstance(submission.get("endTime"), datetime) else submission.get("endTime", ""),
            "score": submission.get("score", 0),
            "maxScore": submission.get("maxScore", 0),
            "percentage": submission.get("percentage", 0),
            "feedback": submission.get("feedback", ""),
            "autoGraded": True,
            "questionGradingResults": submission["questionGradingResults"],
            "hasQuestions": has_questions,
            "hasAnswerKey": has_answer_key,
            "gradedAt": submission.get("gradedAt", "").isoformat() if isinstance(submission.get("gradedAt"), datetime) else submission.get("gradedAt", "")
        }
        
        # Add links to related resources
        if has_questions:
            response_data["questionPaperLink"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/segregated-questions"
            
        if has_answer_key and is_teacher:
            response_data["answerKeyLink"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/segregated-answer-key"
            
        if "segregatedAnswers" in submission:
            response_data["studentAnswersLink"] = f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/submissions/{student_id}/segregated-answers"
        
        # Include more detailed information for teachers
        if is_teacher:
            # Provide summary statistics by question
            question_stats = {}
            
            for result in submission["questionGradingResults"]:
                q_num = result["questionNumber"]
                question_stats[q_num] = {
                    "score": result["score"],
                    "maxScore": result["maxScore"],
                    "percentage": round(result["score"] / result["maxScore"] * 100, 1) if result["maxScore"] > 0 else 0,
                    "keyPointsCovered": len(result.get("key_points_addressed", [])),
                    "keyPointsMissed": len(result.get("key_points_missed", [])),
                    "answered": result.get("answered", False)
                }
            
            response_data["questionStats"] = question_stats
        
        return jsonify(response_data), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error retrieving grading details: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/student", methods=["GET"])
@jwt_required()
def get_student_quizzes(classroom_id):
    """Get all quizzes for a classroom - student view"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
    if error:
        return error
    
    try:
        # Process quizzes for student view
        current_time = get_current_ist_time()
        
        user_obj_id = ObjectId(user_id)
        processed_quizzes = []
        
        for quiz in classroom.get("quizzes", []):
            # Skip unpublished quizzes for students (but not for teachers)
            if not quiz.get("published", True) and classroom["teacher_id"] != user_obj_id:
                continue
            
            # Determine quiz status for this student
            student_status = get_quiz_status(quiz, user_obj_id, current_time)
            
            # Identify quiz type
            quiz_type = quiz.get("quizType", "question")  # Default to question type for backwards compatibility
            
            # Create base student-friendly quiz object
            student_quiz = {
                "id": str(quiz["id"]),
                "title": quiz.get("title", "Untitled Quiz"),
                "description": quiz.get("description", ""),
                "startTime": quiz["startTime"],
                "endTime": calculate_quiz_end_time(quiz),
                "duration": int(quiz["duration"]),
                "quizType": quiz_type,
                "studentStatus": student_status,
                "serverProvidedStatus": True  # Mark status as coming from server to prevent frontend recalculation
            }
            
            # For PDF quizzes, add file information
            if quiz_type == "pdf":
                if "questionPaper" in quiz:
                    student_quiz["questionPaper"] = {
                        "filename": quiz["questionPaper"].get("filename", "question_paper.pdf"),
                        "size": quiz["questionPaper"].get("size", 0)
                    }
            else:
                # For legacy quizzes, use the existing prepare_quiz_for_student function
                legacy_quiz = prepare_quiz_for_student(quiz)
                student_quiz["questions"] = legacy_quiz.get("questions", [])
            
            # If quiz is submitted, include the submission time and score info
            if student_status == "submitted":
                for submission in quiz.get("submissions", []):
                    if submission["student_id"] == user_obj_id:
                        student_quiz["submittedAt"] = submission.get("endTime")
                        student_quiz["score"] = submission.get("score", 0)
                        student_quiz["maxScore"] = submission.get("maxScore", 0)
                        student_quiz["percentage"] = round((submission.get("score", 0) / submission.get("maxScore", 1)) * 100, 1) if submission.get("maxScore", 0) > 0 else 0
                        
                        # For PDF quizzes, add grading status
                        if quiz_type == "pdf":
                            student_quiz["isGraded"] = submission.get("isGraded", False)
                            if "answerFile" in submission:
                                student_quiz["submission"] = {
                                    "filename": submission["answerFile"].get("filename", "answer.pdf"),
                                    "size": submission["answerFile"].get("size", 0)
                                }
                            if submission.get("isGraded", False):
                                student_quiz["feedback"] = submission.get("feedback", "")
                                
                            # Add auto-grading info if available
                            if submission.get("autoGraded", False):
                                student_quiz["autoGraded"] = True
                                if "questionGradingResults" in submission:
                                    student_quiz["gradedQuestionCount"] = len(submission["questionGradingResults"])
                                    student_quiz["gradingDetailUrl"] = f"/api/classrooms/{classroom_id}/quizzes/{str(quiz['id'])}/submissions/{user_id}/grading"
                        break
            
            processed_quizzes.append(student_quiz)
        
        # Sort quizzes by status and start time
        def quiz_sort_key(quiz):
            status_priority = {
                "available": 0,
                "upcoming": 1,
                "submitted": 2,
                "missed": 3
            }
            return (status_priority.get(quiz["studentStatus"], 4), quiz["startTime"])
            
        processed_quizzes.sort(key=quiz_sort_key)
        
        return jsonify(mongo_to_json_serializable(processed_quizzes)), 200
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error getting student quizzes: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submit", methods=["POST"])
@jwt_required()
def submit_quiz(classroom_id, quiz_id):
    """
    Submit a quiz with student answers or PDF submission.
    For PDF submissions, the API extracts text using Google's Gemini 2.5 AI model
    to make the content searchable and accessible. The extracted text is stored
    alongside the original PDF submission for future reference and analysis.
    """
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Check if quiz is published
        if not quiz.get("published", True):
            return jsonify({"msg": "This quiz is not available"}), 400
        
        # Check if student has already submitted
        user_obj_id = ObjectId(user_id)
        if any(s["student_id"] == user_obj_id for s in quiz.get("submissions", [])):
            return jsonify({"msg": "You have already submitted this quiz"}), 400
        
        # Check if quiz is still available (we'll be lenient for development)
        current_time = get_current_ist_time()
        
        quiz_status = get_quiz_status(quiz, user_obj_id, current_time)
        
        if quiz_status == "missed":
            return jsonify({"msg": "This quiz has ended and cannot be submitted"}), 400
            
        # Get submission data based on quiz type
        quiz_type = quiz.get("quizType", "question")  # Default to question type for backwards compatibility
        
        if quiz_type == "pdf":
            # For PDF quizzes, expect a file upload
            if 'answerFile' not in request.files:
                return jsonify({"msg": "No answer file provided"}), 400
                
            answer_file = request.files['answerFile']
            if not answer_file.filename:
                return jsonify({"msg": "No answer file selected"}), 400
                
            # Validate file is a PDF
            if not answer_file.filename.lower().endswith('.pdf'):
                return jsonify({"msg": "Answer file must be a PDF"}), 400
                
            # Read the file
            answer_file_binary = answer_file.read()
            
            # Extract text from the submitted PDF using Gemini 2.5
            try:
                print(f"\nExtracting text from student answer file: {answer_file.filename}")
                print("Processing with Gemini 2.5...")
                
                # Extract text using Gemini 2.5
                extracted_text = extract_text_from_pdf(answer_file_binary)
                print(f"Successfully extracted {len(extracted_text)} characters from student answer")
                print(f"Sample text: {extracted_text[:100]}...")
                
                # Segregate student answers by question number
                print("Segregating student answers by question number...")
                segregated_student_answers = segregate_questions_by_number(extracted_text, is_question_paper=False)
                
                # Create submission object with extracted text
                submission = {
                    "student_id": user_obj_id,
                    "startTime": datetime.fromisoformat(request.form.get("startTime").replace('Z', '+00:00')) if "startTime" in request.form else current_time - timedelta(minutes=5),
                    "endTime": current_time,
                    "answerFile": {
                        "filename": answer_file.filename,
                        "content": Binary(answer_file_binary),
                        "contentType": "application/pdf",
                        "size": len(answer_file_binary)
                    },
                    "extractedText": extracted_text,  # Store the extracted text
                    "segregatedAnswers": segregated_student_answers,  # Store segregated answers
                    "score": 0,  # Score will be set by teacher after grading
                    "maxScore": 100,  # Default max score
                    "isGraded": False
                }
                
                # Attempt to auto-grade if the quiz has an answer key with segregated answers
                if "extractedText" in quiz and "segregatedAnswers" in quiz["extractedText"]:
                    print("Answer key with segregated answers found. Attempting auto-grading...")
                    try:
                        # Auto-grade the submission
                        graded_submission = auto_grade_submission(quiz, submission)
                        
                        # Use the graded submission
                        submission = graded_submission
                        print(f"Auto-grading successful. Score: {submission.get('score', 0)}/{submission.get('maxScore', 100)}")
                    except Exception as grading_error:
                        print(f"Error during auto-grading: {str(grading_error)}")
                        traceback.print_exc()
                        # Continue with ungraded submission
                        submission["autoGradingError"] = str(grading_error)
                else:
                    print("Quiz does not have an answer key with segregated answers. Skipping auto-grading.")
            except Exception as e:
                print(f"Error extracting text from student answer: {str(e)}")
                traceback.print_exc()
                
                # Create submission without extracted text if extraction fails
                submission = {
                    "student_id": user_obj_id,
                    "startTime": datetime.fromisoformat(request.form.get("startTime").replace('Z', '+00:00')) if "startTime" in request.form else current_time - timedelta(minutes=5),
                    "endTime": current_time,
                    "answerFile": {
                        "filename": answer_file.filename,
                        "content": Binary(answer_file_binary),
                        "contentType": "application/pdf",
                        "size": len(answer_file_binary)
                    },
                    "extractionError": str(e),  # Store error message
                    "score": 0,  # Score will be set by teacher after grading
                    "maxScore": 100,  # Default max score
                    "isGraded": False
                }
        else:
            # Legacy quiz submission with questions and answers
            # Get submitted answers
            data = request.get_json()
            if not data:
                return jsonify({"msg": "No data provided"}), 400
                
            # Ensure we have answers
            if "answers" not in data or not isinstance(data["answers"], dict):
                return jsonify({"msg": "Invalid answers format"}), 400
            
            # Score the submission
            correct_count, total_questions, scored_answers = score_quiz_submission(quiz, data["answers"])
            
            # Create submission object
            submission = {
                "student_id": user_obj_id,
                "startTime": datetime.fromisoformat(data.get("startTime").replace('Z', '+00:00')) if "startTime" in data else current_time - timedelta(minutes=5),
                "endTime": current_time,
                "score": correct_count,
                "maxScore": total_questions,
                "answers": scored_answers
            }
        
        # Add submission to quiz
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id), "quizzes.id": ObjectId(quiz_id)},
            {"$push": {"quizzes.$.submissions": submission}}
        )
        
        if not result.modified_count:
            return jsonify({"msg": "Failed to submit quiz"}), 500
        
        # Create response based on quiz type
        if quiz_type == "pdf":
            # For PDF quizzes, just confirm submission
            response_data = {
                "msg": "Quiz submitted successfully",
                "submissionTime": current_time.isoformat(),
                "filename": submission["answerFile"]["filename"],
                "fileSize": submission["answerFile"]["size"]
            }
            
            # Add text extraction info if available
            if "extractedText" in submission:
                text_length = len(submission["extractedText"])
                response_data["textExtracted"] = True
                response_data["textLength"] = text_length
                response_data["textPreview"] = submission["extractedText"][:100] + "..." if text_length > 100 else submission["extractedText"]
                
                # Add segregated answers info if available
                if "segregatedAnswers" in submission:
                    answer_count = len(submission["segregatedAnswers"]) - (1 if "0" in submission["segregatedAnswers"] else 0)
                    response_data["answersSegregated"] = True
                    response_data["answerCount"] = answer_count
                    response_data["segregatedAnswersPreview"] = {
                        k: v[:50] + "..." if len(v) > 50 else v
                        for k, v in list(submission["segregatedAnswers"].items())[:3]
                    }
                
                # Add auto-grading info if available
                if submission.get("isGraded") and submission.get("autoGraded"):
                    response_data["autoGraded"] = True
                    response_data["score"] = submission.get("score", 0)
                    response_data["maxScore"] = submission.get("maxScore", 100)
                    response_data["percentage"] = submission.get("percentage", 0)
                    response_data["gradedQuestionCount"] = len(submission.get("questionGradingResults", []))
                    
                    # Add preview of question scores
                    if "questionGradingResults" in submission and len(submission["questionGradingResults"]) > 0:
                        response_data["questionScores"] = {
                            result["questionNumber"]: f"{result['score']}/{result['maxScore']}"
                            for result in submission["questionGradingResults"][:3]  # Show first 3 questions
                        }
                        
                        if len(submission["questionGradingResults"]) > 3:
                            response_data["questionScores"]["..."] = f"and {len(submission['questionGradingResults']) - 3} more questions"
                
                # Add error information if auto-grading failed
                if "autoGradingError" in submission:
                    response_data["autoGradingError"] = submission["autoGradingError"]
            
            elif "extractionError" in submission:
                response_data["textExtracted"] = False
                response_data["extractionError"] = submission["extractionError"]
            
            return jsonify(response_data), 200
        else:
            # For legacy quizzes, return detailed results
            results = create_quiz_results_response(quiz, scored_answers, correct_count, total_questions)
            results["submittedAt"] = current_time.isoformat()
            return jsonify(results), 200
        
    except ValueError as e:
        # Handle date parsing errors
        return jsonify({"msg": f"Invalid data format: {str(e)}"}), 400
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error submitting quiz: {str(e)}")
        print(f"Traceback: {error_traceback}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/student/analytics", methods=["GET"])
@jwt_required()
def get_student_analytics():
    """Get comprehensive analytics for a student across all classrooms and quizzes"""
    user_id = get_jwt_identity()
    user_obj_id = ObjectId(user_id)
    
    try:
        # Get all classrooms where student is enrolled
        classrooms = list(classrooms_collection.find({"enrolled_students": user_obj_id}))
        
        # Initialize analytics data
        analytics = {
            "overall": {
                "totalQuizzes": 0,
                "quizzesAttempted": 0,
                "averageScore": 0,
                "highestScore": 0,
                "lowestScore": 100,
                "quizzesByType": {"pdf": 0, "question": 0},
                "performanceByMonth": {},
                "rankHistory": []
            },
            "classroomWise": {},
            "recentQuizzes": [],
            "performanceTrends": {
                "monthly": [],
                "bySubject": {},
                "byQuizType": {"pdf": [], "question": []}
            }
        }
        
        total_score = 0
        total_attempted = 0
        
        # Process each classroom
        for classroom in classrooms:
            classroom_id = str(classroom["_id"])
            classroom_name = classroom.get("className", "Unnamed Class")
            subject = classroom.get("subject", "No Subject")
            
            classroom_analytics = {
                "className": classroom_name,
                "subject": subject,
                "totalQuizzes": 0,
                "attempted": 0,
                "averageScore": 0,
                "highestScore": 0,
                "quizzes": []
            }
            
            # Process quizzes in this classroom
            for quiz in classroom.get("quizzes", []):
                if not quiz.get("published", True):
                    continue
                    
                quiz_id = str(quiz["id"])
                quiz_type = quiz.get("quizType", "question")
                analytics["overall"]["quizzesByType"][quiz_type] += 1
                classroom_analytics["totalQuizzes"] += 1
                
                # Find student's submission
                submission = next((sub for sub in quiz.get("submissions", []) 
                                if sub["student_id"] == user_obj_id), None)
                
                if submission:
                    # Get submission details
                    score = submission.get("score", 0)
                    max_score = submission.get("maxScore", 100)
                    percentage = round((score / max_score * 100), 1) if max_score > 0 else 0
                    submission_time = submission.get("endTime")
                    
                    # Update overall stats
                    total_score += percentage
                    total_attempted += 1
                    analytics["overall"]["highestScore"] = max(analytics["overall"]["highestScore"], percentage)
                    analytics["overall"]["lowestScore"] = min(analytics["overall"]["lowestScore"], percentage)
                    
                    # Update classroom stats
                    classroom_analytics["attempted"] += 1
                    classroom_analytics["highestScore"] = max(classroom_analytics["highestScore"], percentage)
                    
                    # Add to recent quizzes
                    quiz_result = {
                        "quizId": quiz_id,
                        "classroomId": classroom_id,
                        "className": classroom_name,
                        "subject": subject,
                        "title": quiz.get("title", "Untitled Quiz"),
                        "type": quiz_type,
                        "score": score,
                        "maxScore": max_score,
                        "percentage": percentage,
                        "submissionTime": submission_time.isoformat() if isinstance(submission_time, datetime) else submission_time,
                        "feedback": submission.get("feedback", ""),
                        "isGraded": submission.get("isGraded", False)
                    }
                    
                    # Add detailed grading if available
                    if submission.get("questionGradingResults"):
                        quiz_result["detailedGrading"] = {
                            "questionCount": len(submission["questionGradingResults"]),
                            "questions": submission["questionGradingResults"]
                        }
                    
                    classroom_analytics["quizzes"].append(quiz_result)
                    analytics["recentQuizzes"].append(quiz_result)
                    
                    # Update monthly performance
                    if submission_time:
                        month_key = submission_time.strftime("%Y-%m") if isinstance(submission_time, datetime) else "unknown"
                        if month_key not in analytics["overall"]["performanceByMonth"]:
                            analytics["overall"]["performanceByMonth"][month_key] = {
                                "totalScore": 0,
                                "count": 0,
                                "average": 0
                            }
                        month_data = analytics["overall"]["performanceByMonth"][month_key]
                        month_data["totalScore"] += percentage
                        month_data["count"] += 1
                        month_data["average"] = round(month_data["totalScore"] / month_data["count"], 1)
                    
                    # Update subject-wise performance
                    if subject not in analytics["performanceTrends"]["bySubject"]:
                        analytics["performanceTrends"]["bySubject"][subject] = []
                    analytics["performanceTrends"]["bySubject"][subject].append({
                        "quizId": quiz_id,
                        "title": quiz.get("title", "Untitled Quiz"),
                        "percentage": percentage,
                        "date": submission_time.isoformat() if isinstance(submission_time, datetime) else submission_time
                    })
                    
                    # Update quiz type performance
                    analytics["performanceTrends"]["byQuizType"][quiz_type].append({
                        "quizId": quiz_id,
                        "title": quiz.get("title", "Untitled Quiz"),
                        "percentage": percentage,
                        "date": submission_time.isoformat() if isinstance(submission_time, datetime) else submission_time
                    })
            
            # Calculate classroom averages
            if classroom_analytics["attempted"] > 0:
                classroom_analytics["averageScore"] = round(
                    sum(q["percentage"] for q in classroom_analytics["quizzes"]) / classroom_analytics["attempted"],
                    1
                )
            
            # Sort classroom quizzes by date
            classroom_analytics["quizzes"].sort(
                key=lambda x: x["submissionTime"] if isinstance(x["submissionTime"], str) else "0",
                reverse=True
            )
            
            analytics["classroomWise"][classroom_id] = classroom_analytics
        
        # Calculate overall statistics
        analytics["overall"]["totalQuizzes"] = sum(c["totalQuizzes"] for c in analytics["classroomWise"].values())
        analytics["overall"]["quizzesAttempted"] = total_attempted
        analytics["overall"]["averageScore"] = round(total_score / total_attempted, 1) if total_attempted > 0 else 0
        
        # Sort recent quizzes by date
        analytics["recentQuizzes"].sort(
            key=lambda x: x["submissionTime"] if isinstance(x["submissionTime"], str) else "0",
            reverse=True
        )
        
        # Prepare monthly trend data
        sorted_months = sorted(analytics["overall"]["performanceByMonth"].keys())
        analytics["performanceTrends"]["monthly"] = [
            {
                "month": month,
                "average": analytics["overall"]["performanceByMonth"][month]["average"]
            }
            for month in sorted_months
        ]
        
        # Calculate and sort rankings for each quiz
        for classroom_id, classroom_data in analytics["classroomWise"].items():
            for quiz in classroom_data["quizzes"]:
                # Get all submissions for this quiz
                classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
                if not classroom:
                    continue
                    
                quiz_obj = next((q for q in classroom.get("quizzes", []) if str(q["id"]) == quiz["quizId"]), None)
                if not quiz_obj:
                    continue
                    
                # Calculate rankings
                submissions = quiz_obj.get("submissions", [])
                sorted_submissions = sorted(
                    submissions,
                    key=lambda x: (x.get("score", 0) / x.get("maxScore", 1)) if x.get("maxScore", 0) > 0 else 0,
                    reverse=True
                )
                
                # Find student's rank
                student_rank = next((i + 1 for i, sub in enumerate(sorted_submissions)
                                  if sub["student_id"] == user_obj_id), None)
                
                if student_rank:
                    quiz["rank"] = student_rank
                    quiz["totalParticipants"] = len(sorted_submissions)
                    
                    # Add to rank history
                    analytics["overall"]["rankHistory"].append({
                        "quizId": quiz["quizId"],
                        "title": quiz["title"],
                        "rank": student_rank,
                        "totalParticipants": len(sorted_submissions),
                        "date": quiz["submissionTime"]
                    })
        
        # Sort rank history by date
        analytics["overall"]["rankHistory"].sort(
            key=lambda x: x["date"] if isinstance(x["date"], str) else "0",
            reverse=True
        )
        
        return jsonify(analytics), 200
        
    except Exception as e:
        print(f"Error generating analytics: {str(e)}")
        traceback.print_exc()
        return jsonify({"msg": f"Error generating analytics: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/analytics", methods=["GET"])
@jwt_required()
def get_classroom_analytics(classroom_id):
    """Get detailed analytics for a specific classroom"""
    user_id = get_jwt_identity()
    
    try:
        # Get classroom and validate access
        classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id)
        if error:
            return error
            
        is_teacher = classroom["teacher_id"] == ObjectId(user_id)
        
        # Initialize analytics
        analytics = {
            "overview": {
                "totalStudents": len(classroom.get("enrolled_students", [])),
                "totalQuizzes": len(classroom.get("quizzes", [])),
                "averageParticipation": 0,
                "averageScore": 0
            },
            "quizzes": [],
            "studentPerformance": [] if is_teacher else None,
            "participationTrend": [],
            "scoreTrend": [],
            "quizTypeDistribution": {"pdf": 0, "question": 0}
        }
        
        total_participation = 0
        total_score = 0
        total_submissions = 0
        
        # Process each quiz
        for quiz in classroom.get("quizzes", []):
            quiz_id = str(quiz["id"])
            quiz_type = quiz.get("quizType", "question")
            submissions = quiz.get("submissions", [])
            
            # Update quiz type count
            analytics["quizTypeDistribution"][quiz_type] += 1
            
            # Calculate quiz statistics
            participation_rate = len(submissions) / analytics["overview"]["totalStudents"] if analytics["overview"]["totalStudents"] > 0 else 0
            total_participation += participation_rate
            
            quiz_scores = []
            for submission in submissions:
                score = submission.get("score", 0)
                max_score = submission.get("maxScore", 100)
                percentage = round((score / max_score * 100), 1) if max_score > 0 else 0
                quiz_scores.append(percentage)
                total_score += percentage
                total_submissions += 1
            
            avg_score = round(sum(quiz_scores) / len(quiz_scores), 1) if quiz_scores else 0
            
            # Create quiz analytics
            quiz_analytics = {
                "quizId": quiz_id,
                "title": quiz.get("title", "Untitled Quiz"),
                "type": quiz_type,
                "participationRate": round(participation_rate * 100, 1),
                "averageScore": avg_score,
                "submissionCount": len(submissions),
                "scoreDistribution": {
                    "90-100": len([s for s in quiz_scores if s >= 90]),
                    "80-89": len([s for s in quiz_scores if 80 <= s < 90]),
                    "70-79": len([s for s in quiz_scores if 70 <= s < 80]),
                    "60-69": len([s for s in quiz_scores if 60 <= s < 70]),
                    "below-60": len([s for s in quiz_scores if s < 60])
                }
            }
            
            # Add detailed question analysis for teachers
            if is_teacher and "questionGradingResults" in quiz:
                question_analysis = {}
                for submission in submissions:
                    if "questionGradingResults" in submission:
                        for result in submission["questionGradingResults"]:
                            q_num = result["questionNumber"]
                            if q_num not in question_analysis:
                                question_analysis[q_num] = {
                                    "totalScore": 0,
                                    "attempts": 0,
                                    "averageScore": 0
                                }
                            question_analysis[q_num]["totalScore"] += result.get("score", 0)
                            question_analysis[q_num]["attempts"] += 1
                
                # Calculate averages
                for q_num in question_analysis:
                    attempts = question_analysis[q_num]["attempts"]
                    if attempts > 0:
                        question_analysis[q_num]["averageScore"] = round(
                            question_analysis[q_num]["totalScore"] / attempts,
                            1
                        )
                
                quiz_analytics["questionAnalysis"] = question_analysis
            
            analytics["quizzes"].append(quiz_analytics)
            
            # Add to trends
            analytics["participationTrend"].append({
                "quizId": quiz_id,
                "title": quiz.get("title", "Untitled Quiz"),
                "participation": round(participation_rate * 100, 1),
                "date": quiz.get("startTime", "").isoformat() if isinstance(quiz.get("startTime"), datetime) else quiz.get("startTime", "")
            })
            
            analytics["scoreTrend"].append({
                "quizId": quiz_id,
                "title": quiz.get("title", "Untitled Quiz"),
                "averageScore": avg_score,
                "date": quiz.get("startTime", "").isoformat() if isinstance(quiz.get("startTime"), datetime) else quiz.get("startTime", "")
            })
        
        # Calculate overall statistics
        quiz_count = len(classroom.get("quizzes", []))
        if quiz_count > 0:
            analytics["overview"]["averageParticipation"] = round((total_participation / quiz_count) * 100, 1)
        
        if total_submissions > 0:
            analytics["overview"]["averageScore"] = round(total_score / total_submissions, 1)
        
        # For teachers, add student performance analysis
        if is_teacher:
            student_performance = {}
            
            # Process each student's performance
            for student_id in classroom.get("enrolled_students", []):
                student = users_collection.find_one({"_id": student_id})
                if not student:
                    continue
                    
                student_data = {
                    "studentId": str(student_id),
                    "name": student.get("fullName", "Unknown Student"),
                    "email": student.get("email", ""),
                    "quizzesAttempted": 0,
                    "averageScore": 0,
                    "totalScore": 0,
                    "quizScores": []
                }
                
                # Get student's submissions across all quizzes
                for quiz in classroom.get("quizzes", []):
                    submission = next((sub for sub in quiz.get("submissions", [])
                                    if sub["student_id"] == student_id), None)
                    
                    if submission:
                        score = submission.get("score", 0)
                        max_score = submission.get("maxScore", 100)
                        percentage = round((score / max_score * 100), 1) if max_score > 0 else 0
                        
                        student_data["quizzesAttempted"] += 1
                        student_data["totalScore"] += percentage
                        student_data["quizScores"].append({
                            "quizId": str(quiz["id"]),
                            "title": quiz.get("title", "Untitled Quiz"),
                            "score": score,
                            "maxScore": max_score,
                            "percentage": percentage,
                            "submissionTime": submission.get("endTime", "").isoformat() if isinstance(submission.get("endTime"), datetime) else submission.get("endTime", "")
                        })
                
                if student_data["quizzesAttempted"] > 0:
                    student_data["averageScore"] = round(
                        student_data["totalScore"] / student_data["quizzesAttempted"],
                        1
                    )
                
                analytics["studentPerformance"].append(student_data)
            
            # Sort student performance by average score
            analytics["studentPerformance"].sort(
                key=lambda x: x["averageScore"],
                reverse=True
            )
        
        # Sort trends by date
        analytics["participationTrend"].sort(key=lambda x: x["date"])
        analytics["scoreTrend"].sort(key=lambda x: x["date"])
        
        return jsonify(analytics), 200
        
    except Exception as e:
        print(f"Error generating classroom analytics: {str(e)}")
        traceback.print_exc()
        return jsonify({"msg": f"Error generating classroom analytics: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("FLASK_ENV") == "development"
    
    app.run(
        host=host,
        port=port,
        debug=debug
    )
