import os
from datetime import datetime, timedelta
from flask import Flask, send_file, redirect, url_for, request, jsonify, render_template, make_response
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from pymongo import MongoClient
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import random
import string
from google import genai
from google.genai import types
import json
from bson import Binary
import io

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

load_dotenv()
app = Flask(__name__, template_folder="src", static_folder="src", static_url_path="")
app.json_encoder = MongoJSONEncoder
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise Exception("GEMINI_API_KEY not set in .env file")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)
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
        current_time = datetime.utcnow()
        
    # Check if student has submitted
    has_submitted = any(
        submission["student_id"] == user_obj_id 
        for submission in quiz.get("submissions", [])
    )
    
    if has_submitted:
        return "submitted"
        
    # Calculate quiz times
    quiz_start = quiz["startTime"]
    quiz_end = calculate_quiz_end_time(quiz)
    
    # Determine status
    if current_time < quiz_start - QUIZ_TIME_BUFFER:
        return "upcoming"
    elif current_time > quiz_end + QUIZ_TIME_BUFFER:
        return "missed"
    else:
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
            # Create and store a new chat session with appropriate system instructions.
            chat_sessions[user_id] = gemini_client.chats.create(
                model="gemini-2.0-flash",
                config=types.GenerateContentConfig(
                    # max_output_tokens=300,
                    temperature=0.3,
                    system_instruction=(
                        "You are an AI academic assistant. Answer the user's doubt clearly and concisely."
                        "If User asks for navigation help, give them clear instructions to switch to navigate function of the chatbot."
                        "If User asks for non-academic help, give them clear instructions to be diligent to their studies."
                        )
                )
            )
        chat = chat_sessions[user_id]
        try:
            response = chat.send_message(query)
            answer = response.text
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
        config = types.GenerateContentConfig(
            # max_output_tokens=300,
            temperature=0.3,
            system_instruction=system_instruction
        )
        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[query],
                config=config
            )
            answer = response.text
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
        "profileImage": data.get("profileImage", ""),
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
            scheduled_time = datetime.fromisoformat(scheduled_time_str)
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
        print(f"Error retrieving quizzes: {str(e)}")
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
            
            return jsonify({
                "msg": "Quiz created successfully", 
                "quiz": mongo_to_json_serializable(response_quiz)
            }), 201
        
        return jsonify({"msg": "Failed to create quiz"}), 500
        
    except Exception as e:
        print(f"Error creating quiz: {str(e)}")
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
        print(f"Error retrieving quiz: {str(e)}")
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
        print(f"Error updating quiz: {str(e)}")
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
        print(f"Error deleting quiz: {str(e)}")
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
                
                # Add file info if available
                if "answerFile" in submission:
                    submission_copy["answerFile"] = {
                        "filename": submission["answerFile"].get("filename", "answer.pdf"),
                        "size": submission["answerFile"].get("size", 0)
                    }
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
        stats = {
            "totalSubmissions": len(submissions),
            "averageScore": 0,
            "highestScore": 0,
            "lowestScore": 100 if submissions else 0,
            "needsManualGrading": False
        }
        
        if submissions:
            percentages = [s["percentage"] for s in submissions]
            stats["averageScore"] = round(sum(percentages) / len(percentages), 1)
            stats["highestScore"] = max(percentages)
            stats["lowestScore"] = min(percentages)
            
            if quiz_type == "pdf":
                # For PDF quizzes, check if any need grading
                stats["needsManualGrading"] = any(not s.get("isGraded", False) for s in submissions)
            else:
                # For question-based quizzes, check subjective questions
                stats["needsManualGrading"] = any(
                    s.get("subjectiveStatus", {}).get("pending", 0) > 0 for s in submissions
                )
                
                # Only add question statistics for question-based quizzes
                if "questions" in quiz:
                    stats["questionsStatistics"] = {}
                    
                    # Calculate per-question statistics based on question type
                    for question in quiz["questions"]:
                        q_id = str(question["id"])
                        q_type = question.get("type", "single_choice")
                        
                        # Initialize stats for this question
                        question_stats = {
                            "type": q_type,
                            "text": question["text"],
                            "points": question.get("points", 1)
                        }
                        
                        if q_type == "subjective":
                            # For subjective questions, track graded vs ungraded
                            answered_count = 0
                            graded_count = 0
                            total_score = 0
                            
                            for submission in submissions:
                                if q_id in submission.get("answers", {}):
                                    answered_count += 1
                                    answer = submission["answers"][q_id]
                                    if answer.get("isGraded", False):
                                        graded_count += 1
                                        total_score += answer.get("score", 0)
                            
                            question_stats.update({
                                "answered": answered_count,
                                "graded": graded_count,
                                "pending": answered_count - graded_count,
                                "averageScore": round(total_score / graded_count, 1) if graded_count > 0 else 0,
                                "maxScore": question.get("points", 1)
                            })
                        
                        elif q_type == "multiple_choice":
                            # For multiple choice, track selection of each option
                            option_stats = {}
                            answered_count = 0
                            correct_count = 0
                            partial_count = 0
                            
                            # Initialize option statistics
                            for option in question.get("options", []):
                                opt_id = option["id"]
                                option_stats[opt_id] = {
                                    "text": option["text"],
                                    "isCorrect": opt_id in question.get("correctOptions", []),
                                    "count": 0
                                }
                            
                            for submission in submissions:
                                if q_id in submission.get("answers", {}):
                                    answer = submission["answers"][q_id]
                                    answered_count += 1
                                    
                                    # Track correctness
                                    if answer.get("isCorrect", False):
                                        correct_count += 1
                                    elif answer.get("score", 0) > 0:
                                        partial_count += 1
                                        
                                    # Track selected options
                                    for selected_id in answer.get("selected", []):
                                        if selected_id in option_stats:
                                            option_stats[selected_id]["count"] += 1
                            
                            question_stats.update({
                                "options": option_stats,
                                "answered": answered_count,
                                "correct": correct_count,
                                "partial": partial_count,
                                "incorrect": answered_count - correct_count - partial_count,
                                "correctPercentage": round((correct_count / answered_count) * 100, 1) if answered_count > 0 else 0
                            })
                            
                        else:
                            # For single choice, track selection rate of each option
                            option_stats = {}
                            answered_count = 0
                            correct_count = 0
                            
                            # Initialize option statistics
                            for option in question.get("options", []):
                                opt_id = option["id"]
                                option_stats[opt_id] = {
                                    "text": option["text"],
                                    "isCorrect": opt_id == question.get("correctOption", ""),
                                    "count": 0
                                }
                            
                            for submission in submissions:
                                if q_id in submission.get("answers", {}):
                                    answer = submission["answers"][q_id]
                                    answered_count += 1
                                    
                                    # Track correctness
                                    if answer.get("isCorrect", False):
                                        correct_count += 1
                                        
                                    # Track selected option
                                    selected_id = answer.get("selected", "")
                                    if selected_id in option_stats:
                                        option_stats[selected_id]["count"] += 1
                            
                            question_stats.update({
                                "options": option_stats,
                                "answered": answered_count,
                                "correct": correct_count,
                                "incorrect": answered_count - correct_count,
                                "correctPercentage": round((correct_count / answered_count) * 100, 1) if answered_count > 0 else 0
                            })
                        
                        # Add to overall statistics
                        stats["questionsStatistics"][q_id] = question_stats
        
        # Compile results based on quiz type
        result = {
            "quizId": quiz_id,
            "quizTitle": quiz["title"],
            "quizDescription": quiz["description"],
            "startTime": quiz["startTime"],
            "endTime": calculate_quiz_end_time(quiz),
            "duration": quiz["duration"],
            "submissions": submissions,
            "statistics": stats,
            "quizType": quiz_type
        }
        
        # Add specific fields based on quiz type
        if quiz_type == "pdf":
            # For PDF quizzes, add file information
            if "questionPaper" in quiz:
                result["questionPaper"] = {
                    "filename": quiz["questionPaper"].get("filename", "question_paper.pdf"),
                    "size": quiz["questionPaper"].get("size", 0)
                }
                
            if "answerKey" in quiz:
                result["answerKey"] = {
                    "filename": quiz["answerKey"].get("filename", "answer_key.pdf"),
                    "size": quiz["answerKey"].get("size", 0)
                }
        else:
            # For question-based quizzes, add question count and subjective question flag
            if "questions" in quiz:
                result["totalQuestions"] = len(quiz["questions"])
                result["hasSubjectiveQuestions"] = any(q.get("type") == "subjective" for q in quiz["questions"])
            else:
                result["totalQuestions"] = 0
                result["hasSubjectiveQuestions"] = False
        
        return jsonify(mongo_to_json_serializable(result)), 200
        
    except Exception as e:
        print(f"Error getting quiz results: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

# Student endpoints
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
        current_time = datetime.utcnow()
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
                "studentStatus": student_status
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
                        student_quiz["percentage"] = round((submission.get("score", 0) / submission.get("maxScore", 1)) * 100, 1)
                        
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
                        break
            
            processed_quizzes.append(student_quiz)
        
        # Sort quizzes by status and start time
        def quiz_sort_key(quiz):
            status_priority = {
                "active": 0,
                "upcoming": 1,
                "submitted": 2,
                "missed": 3
            }
            return (status_priority.get(quiz["studentStatus"], 4), quiz["startTime"])
            
        processed_quizzes.sort(key=quiz_sort_key)
        
        return jsonify(mongo_to_json_serializable(processed_quizzes)), 200
        
    except Exception as e:
        print(f"Error getting student quizzes: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/start", methods=["POST"])
@jwt_required()
def start_quiz(classroom_id, quiz_id):
    """Mark a quiz as started by a student"""
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
        
        # Check if quiz is available
        user_obj_id = ObjectId(user_id)
        current_time = datetime.utcnow()
        quiz_status = get_quiz_status(quiz, user_obj_id, current_time)
        
        # Only allow available quizzes to be started
        if quiz_status == "submitted":
            return jsonify({"msg": "You have already submitted this quiz"}), 400
            
        if quiz_status == "missed":
            return jsonify({"msg": "This quiz has already ended"}), 400
            
        if quiz_status != "available":
            return jsonify({"msg": f"This quiz is not available for taking. Status: {quiz_status}"}), 400
        
        # Return basic quiz info for the student to start
        student_quiz = prepare_quiz_for_student(quiz)
        
        # Add time tracking
        result = {
            "msg": "Quiz started successfully", 
            "quiz": student_quiz,
            "startTime": current_time.isoformat()
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Error starting quiz: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submit", methods=["POST"])
@jwt_required()
def submit_quiz(classroom_id, quiz_id):
    """Submit a quiz with student answers or PDF submission"""
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
        current_time = datetime.utcnow()
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
            
            # Create submission object for PDF quiz
            submission = {
                "student_id": user_obj_id,
                "startTime": datetime.fromisoformat(request.form.get("startTime")) if "startTime" in request.form else current_time - timedelta(minutes=5),
                "endTime": current_time,
                "answerFile": {
                    "filename": answer_file.filename,
                    "content": Binary(answer_file_binary),
                    "contentType": "application/pdf",
                    "size": len(answer_file_binary)
                },
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
                "startTime": datetime.fromisoformat(data.get("startTime")) if "startTime" in data else current_time - timedelta(minutes=5),
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
            return jsonify({
                "msg": "Quiz submitted successfully",
                "submissionTime": current_time.isoformat(),
                "filename": submission["answerFile"]["filename"],
                "fileSize": submission["answerFile"]["size"]
            }), 200
        else:
            # For legacy quizzes, return detailed results
            results = create_quiz_results_response(quiz, scored_answers, correct_count, total_questions)
            results["submittedAt"] = current_time.isoformat()
            return jsonify(results), 200
        
    except ValueError as e:
        # Handle date parsing errors
        return jsonify({"msg": f"Invalid data format: {str(e)}"}), 400
    except Exception as e:
        print(f"Error submitting quiz: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/results/student", methods=["GET"])
@jwt_required()
def get_student_quiz_results(classroom_id, quiz_id):
    """Get a student's results for a specific quiz"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "student")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Identify quiz type
        quiz_type = quiz.get("quizType", "question")  # Default to question type for backwards compatibility
        
        # Find student's submission
        user_obj_id = ObjectId(user_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == user_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "You have not submitted this quiz"}), 404
        
        # Common quiz metadata for all quiz types
        results = {
            "quizTitle": quiz["title"],
            "quizDescription": quiz["description"],
            "startTime": quiz["startTime"],
            "endTime": calculate_quiz_end_time(quiz),
            "duration": quiz["duration"],
            "submissionDate": submission.get("endTime"),
            "timeSpent": int((submission.get("endTime", datetime.utcnow()) - 
                           submission.get("startTime", submission.get("endTime", datetime.utcnow()))).total_seconds() / 60),
            "quizType": quiz_type
        }
        
        # Handle results based on quiz type
        if quiz_type == "pdf":
            # For PDF quizzes, get submission and grading info
            results.update({
                "score": submission.get("score", 0),
                "maxScore": submission.get("maxScore", 100),
                "percentage": round((submission.get("score", 0) / submission.get("maxScore", 100)) * 100, 1),
                "isGraded": submission.get("isGraded", False),
                "feedback": submission.get("feedback", "")
            })
            
            # Add submission file info if available
            if "answerFile" in submission:
                results["submission"] = {
                    "filename": submission["answerFile"].get("filename", "answer.pdf"),
                    "size": submission["answerFile"].get("size", 0),
                    "downloadUrl": f"/api/classrooms/{classroom_id}/quizzes/{quiz_id}/submissions/{user_id}/answer-pdf"
                }
        else:
            # For legacy quizzes, use the existing results creation
            scored_answers = submission.get("answers", {})
            legacy_results = create_quiz_results_response(
                quiz, 
                scored_answers, 
                submission["score"], 
                submission["maxScore"]
            )
            
            # Merge legacy results with common metadata
            results.update({
                "score": legacy_results["score"],
                "totalPossible": legacy_results["totalPossible"],
                "percentage": legacy_results["percentage"],
                "correctCount": legacy_results["correctCount"],
                "totalQuestions": legacy_results["totalQuestions"],
                "questions": legacy_results["questions"],
                "summary": legacy_results["summary"]
            })
        
        return jsonify(mongo_to_json_serializable(results)), 200
        
    except Exception as e:
        print(f"Error getting student quiz results: {str(e)}")
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
        print(f"Error retrieving quiz PDF: {str(e)}")
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
        print(f"Error retrieving submission PDF: {str(e)}")
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
        print(f"Error grading PDF submission: {str(e)}")
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
        print(f"Error retrieving student answer PDF: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)