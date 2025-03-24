import os
from datetime import datetime, timedelta
from flask import Flask, send_file, redirect, url_for, request, jsonify, render_template
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
    
    Returns one of: "submitted", "upcoming", "active", "missed"
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
        return "active"

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
    data = request.get_json()
    update_data = {
        "fullName": data.get("fullName"),
        "email": data.get("email"),
        "phone": data.get("phone", ""),
        "institution": data.get("institution", ""),
        "department": data.get("department", ""),
        "title": data.get("title", ""),
        "bio": data.get("bio", "")
    }
    
    # Only update profile image if provided
    if data.get("profileImage"):
        update_data["profileImage"] = data.get("profileImage")
        
    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    return jsonify({"msg": "Profile updated"}), 200

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
        
        # Add student names to submissions and calculate some statistics
        for quiz in quizzes:
            if "submissions" in quiz:
                # Calculate submission stats
                total_submissions = len(quiz["submissions"])
                total_score = sum(sub.get("score", 0) for sub in quiz["submissions"])
                max_possible = total_submissions * quiz.get("questions", [])
                avg_score = total_score / total_submissions if total_submissions > 0 else 0
                
                quiz["submissionStats"] = {
                    "submissionCount": total_submissions,
                    "averageScore": round(avg_score, 1),
                    "averagePercentage": round((avg_score / len(quiz["questions"])) * 100, 1) if quiz.get("questions") else 0
                }
                
                # Add student names
                for submission in quiz["submissions"]:
                    student = users_collection.find_one({"_id": submission["student_id"]})
                    submission["studentName"] = student["fullName"] if student else "Unknown"
                    
                    # Calculate percentage score for each submission
                    max_score = submission.get("maxScore", 0)
                    score = submission.get("score", 0)
                    submission["percentage"] = round((score / max_score) * 100, 1) if max_score > 0 else 0
            
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
    """Create a new quiz for a classroom"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Validate request data
        data = request.get_json()
        if not data:
            return jsonify({"msg": "Quiz data is required"}), 400
        
        # Check required fields
        required_fields = ["title", "description", "startTime", "duration", "questions"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({"msg": f"Missing required fields: {', '.join(missing_fields)}"}), 400
        
        # Validate questions
        questions = data["questions"]
        if not questions or not isinstance(questions, list) or len(questions) == 0:
            return jsonify({"msg": "At least one question is required"}), 400
        
        # Process questions and options
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
        
        # Create quiz object
        quiz = {
            "id": ObjectId(),
            "title": data["title"],
            "description": data["description"],
            "startTime": start_time,
            "duration": duration,
            "published": data.get("published", True),
            "questions": processed_questions,
            "submissions": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        
        # Add quiz to classroom
        result = classrooms_collection.update_one(
            {"_id": ObjectId(classroom_id)},
            {"$push": {"quizzes": quiz}}
        )
        
        if result.modified_count:
            # Calculate and add end time for response
            quiz["endTime"] = calculate_quiz_end_time(quiz)
            return jsonify({
                "msg": "Quiz created successfully", 
                "quiz": mongo_to_json_serializable(quiz)
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
        
        # Validate request data
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
        
        # Process submissions
        submissions = []
        for submission in quiz.get("submissions", []):
            # Get student info
            student = users_collection.find_one({"_id": submission["student_id"]})
            submission_copy = submission.copy()
            submission_copy["studentName"] = student["fullName"] if student else "Unknown"
            submission_copy["studentEmail"] = student["email"] if student else ""
            
            # Calculate percentage score
            max_score = submission["maxScore"]
            score = submission["score"]
            submission_copy["percentage"] = round((score / max_score) * 100, 1) if max_score > 0 else 0
            
            # Process status of subjective questions
            subjective_status = {
                "total": 0,
                "graded": 0,
                "pending": 0
            }
            
            # Check each answer
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
            "questionsStatistics": {},
            "needsManualGrading": False
        }
        
        if submissions:
            percentages = [s["percentage"] for s in submissions]
            stats["averageScore"] = round(sum(percentages) / len(percentages), 1)
            stats["highestScore"] = max(percentages)
            stats["lowestScore"] = min(percentages)
            
            # Check if any submissions need manual grading
            stats["needsManualGrading"] = any(
                s["subjectiveStatus"]["pending"] > 0 for s in submissions
            )
            
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
        
        # Compile results
        result = {
            "quizId": quiz_id,
            "quizTitle": quiz["title"],
            "quizDescription": quiz["description"],
            "totalQuestions": len(quiz["questions"]),
            "startTime": quiz["startTime"],
            "endTime": calculate_quiz_end_time(quiz),
            "duration": quiz["duration"],
            "submissions": submissions,
            "statistics": stats,
            "hasSubjectiveQuestions": any(q.get("type") == "subjective" for q in quiz["questions"])
        }
        
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
            
            # Create student-friendly quiz object (no correct answers)
            student_quiz = prepare_quiz_for_student(quiz)
            student_quiz["studentStatus"] = student_status
            
            # If quiz is submitted, include the submission time
            if student_status == "submitted":
                for submission in quiz.get("submissions", []):
                    if submission["student_id"] == user_obj_id:
                        student_quiz["submittedAt"] = submission.get("endTime")
                        student_quiz["score"] = submission.get("score", 0)
                        student_quiz["maxScore"] = submission.get("maxScore", 0)
                        student_quiz["percentage"] = round((submission.get("score", 0) / submission.get("maxScore", 1)) * 100, 1)
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
        
        # Only allow active quizzes to be started
        if quiz_status == "submitted":
            return jsonify({"msg": "You have already submitted this quiz"}), 400
            
        if quiz_status == "missed":
            return jsonify({"msg": "This quiz has already ended"}), 400
        
        # For testing and development, we'll allow upcoming quizzes to be started as well
        # but in production you might want to uncomment this:
        # if quiz_status == "upcoming":
        #     return jsonify({"msg": "This quiz has not started yet"}), 400
        
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
    """Submit a quiz with student answers"""
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
        
        # Create the results response
        results = create_quiz_results_response(quiz, scored_answers, correct_count, total_questions)
        
        # Add submission time
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
        
        # Find student's submission
        user_obj_id = ObjectId(user_id)
        submission = None
        
        for sub in quiz.get("submissions", []):
            if sub["student_id"] == user_obj_id:
                submission = sub
                break
                
        if not submission:
            return jsonify({"msg": "You have not submitted this quiz"}), 404
        
        # Get the scored answers
        scored_answers = submission.get("answers", {})
        
        # Create detailed results
        results = create_quiz_results_response(
            quiz, 
            scored_answers, 
            submission["score"], 
            submission["maxScore"]
        )
        
        # Add quiz metadata
        results.update({
            "quizTitle": quiz["title"],
            "quizDescription": quiz["description"],
            "startTime": quiz["startTime"],
            "endTime": calculate_quiz_end_time(quiz),
            "duration": quiz["duration"],
            "submissionDate": submission.get("endTime"),
            "timeSpent": int((submission.get("endTime", datetime.utcnow()) - 
                             submission.get("startTime", submission.get("endTime", datetime.utcnow()))).total_seconds() / 60)
        })
        
        return jsonify(mongo_to_json_serializable(results)), 200
        
    except Exception as e:
        print(f"Error getting student quiz results: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/enrolled-students", methods=["GET"])
@jwt_required(optional=True)
def get_enrolled_students():
    """Get all students enrolled in the teacher's classrooms with their details"""
    # Get user ID from JWT token (will be None if no valid token)
    user_id = get_jwt_identity()
    
    # Log authentication status
    if user_id:
        print(f"User authenticated with ID: {user_id}")
    else:
        print("No valid authentication token provided")
    
    # Check request headers for debugging
    auth_header = request.headers.get('Authorization')
    print(f"Authorization header present: {auth_header is not None}")
    if auth_header:
        print(f"Authorization header starts with 'Bearer': {auth_header.startswith('Bearer ')}")
        print(f"Authorization header length: {len(auth_header)}")
    
    # First try to get real data if user is authenticated
    if user_id:
        try:
            user = users_collection.find_one({"_id": ObjectId(user_id)})
            if user and user["userType"] == "teacher":
                print(f"Fetching enrolled students for teacher: {user.get('fullName', 'Unknown')}")
                
                # Get all classrooms where this teacher is the owner
                teacher_classrooms = list(classrooms_collection.find({"teacher_id": ObjectId(user_id)}))
                print(f"Found {len(teacher_classrooms)} classrooms for this teacher")
                
                result = []
                student_counts = {}
                
                for classroom in teacher_classrooms:
                    classroom_data = {
                        "id": str(classroom["_id"]),
                        "name": classroom.get("className", "Unnamed Class"),
                        "subject": classroom.get("subject", "General"),
                        "section": classroom.get("section", "Main"),
                        "students": []
                    }
                    
                    # Get all enrolled students for this classroom
                    enrolled_student_ids = classroom.get("enrolled_students", [])
                    print(f"Classroom {classroom_data['name']} has {len(enrolled_student_ids)} enrolled students")
                    
                    for student_id in enrolled_student_ids:
                        student = users_collection.find_one({"_id": student_id})
                        if student:
                            # Count student across all classrooms
                            student_id_str = str(student["_id"])
                            if student_id_str in student_counts:
                                student_counts[student_id_str]["count"] += 1
                            else:
                                # Collect all available student data
                                student_data = {
                                    "id": student_id_str,
                                    "name": student.get("fullName", "Unknown"),
                                    "email": student.get("email", ""),
                                    "institution": student.get("institution", "No institution provided"),
                                    "department": student.get("department", "No department provided"),
                                    "phone": student.get("phone", "No phone provided"),
                                    "title": student.get("title", "Student"),
                                    "bio": student.get("bio", "No bio provided"),
                                    "joinedAt": student.get("createdAt", datetime.utcnow())
                                }
                                
                                student_counts[student_id_str] = {
                                    "count": 1,
                                    "student": student_data
                                }
                            
                            # Add student to this classroom
                            classroom_data["students"].append({
                                "id": student_id_str,
                                "name": student.get("fullName", "Unknown"),
                                "email": student.get("email", "")
                            })
                        else:
                            print(f"Warning: Student with ID {student_id} not found in the database")
                            
                    result.append(classroom_data)
                
                # Get all unique students sorted by enrollment count
                all_students = [data["student"] for _, data in sorted(
                    student_counts.items(), 
                    key=lambda x: x[1]["count"], 
                    reverse=True
                )]
                
                print(f"Successfully fetched data for {len(all_students)} students across {len(result)} classrooms")
                
                return jsonify({
                    "classrooms": result,
                    "students": all_students,
                    "totalClassrooms": len(result),
                    "totalStudents": len(all_students)
                }), 200
            else:
                print("User is not a teacher or not found, using sample data")
        except Exception as e:
            print(f"Error getting real data: {e}")
            # Fall back to sample data if anything fails
    
    # Provide sample data if not authenticated or if fetching real data failed
    print("Using sample data for enrolled students")
    sample_classrooms = [
        {
            "id": "class1",
            "name": "Mathematics 101",
            "subject": "Mathematics",
            "section": "A",
            "students": [
                {
                    "id": "student1",
                    "name": "John Smith",
                    "email": "john.smith@example.com"
                },
                {
                    "id": "student2",
                    "name": "Emily Johnson",
                    "email": "emily.j@example.com"
                },
                {
                    "id": "student3",
                    "name": "Michael Brown",
                    "email": "michael.b@example.com"
                }
            ]
        },
        {
            "id": "class2",
            "name": "Physics 202",
            "subject": "Physics",
            "section": "B",
            "students": [
                {
                    "id": "student1",
                    "name": "John Smith",
                    "email": "john.smith@example.com"
                },
                {
                    "id": "student4",
                    "name": "Sarah Williams",
                    "email": "sarah.w@example.com"
                }
            ]
        },
        {
            "id": "class3",
            "name": "Computer Science 301",
            "subject": "Computer Science",
            "section": "C",
            "students": [
                {
                    "id": "student2",
                    "name": "Emily Johnson",
                    "email": "emily.j@example.com"
                },
                {
                    "id": "student3",
                    "name": "Michael Brown",
                    "email": "michael.b@example.com"
                },
                {
                    "id": "student5",
                    "name": "David Miller",
                    "email": "david.m@example.com"
                },
                {
                    "id": "student6",
                    "name": "Jessica Davis",
                    "email": "jessica.d@example.com"
                }
            ]
        }
    ]
    
    # Add more sample data for better UI testing
    sample_classrooms.append({
        "id": "class4",
        "name": "History 101",
        "subject": "History",
        "section": "D",
        "students": [
            {
                "id": "student7",
                "name": "Alex Thompson",
                "email": "alex.t@example.com"
            },
            {
                "id": "student8",
                "name": "Olivia Wilson",
                "email": "olivia.w@example.com"
            }
        ]
    })
    
    # Prepare student data
    student_counts = {}
    
    for classroom in sample_classrooms:
        for student in classroom["students"]:
            student_id = student["id"]
            if student_id in student_counts:
                student_counts[student_id]["count"] += 1
            else:
                student_counts[student_id] = {
                    "count": 1,
                    "student": {
                        "id": student_id,
                        "name": student["name"],
                        "email": student["email"],
                        "institution": "Sample University (PLACEHOLDER)",
                        "department": "Sample Department (PLACEHOLDER)",
                        "phone": "123-456-7890 (PLACEHOLDER)",
                        "title": "Student (PLACEHOLDER)",
                        "bio": "This is sample data. Please log in to see real student information. (PLACEHOLDER)",
                        "joinedAt": "2023-01-15T12:00:00Z"
                    }
                }
    
    # Get all unique students sorted by enrollment count
    all_students = [data["student"] for _, data in sorted(
        student_counts.items(), 
        key=lambda x: x[1]["count"], 
        reverse=True
    )]
    
    return jsonify({
        "classrooms": sample_classrooms,
        "students": all_students,
        "totalClassrooms": len(sample_classrooms),
        "totalStudents": len(all_students),
        "isSampleData": True
    }), 200

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submissions/<student_id>/grade", methods=["POST"])
@jwt_required()
def grade_subjective_questions(classroom_id, quiz_id, student_id):
    """Grade subjective questions for a student's quiz submission"""
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
        if not data or "grades" not in data:
            return jsonify({"msg": "Grading data is required"}), 400
        
        grades = data["grades"]
        if not isinstance(grades, dict):
            return jsonify({"msg": "Grades data must be an object mapping question IDs to grades"}), 400
        
        # Keep track of total score changes
        score_change = 0
        old_score = submission.get("score", 0)
        
        # Update each answer with grades
        for question_id, grade_data in grades.items():
            # Find the question to validate the grade
            question = None
            for q in quiz["questions"]:
                if str(q["id"]) == question_id:
                    question = q
                    break
                    
            if not question:
                continue  # Skip questions that don't exist
                
            # Only grade subjective questions
            if question.get("type") != "subjective":
                continue
                
            # Validate grade data
            if not isinstance(grade_data, dict):
                continue
                
            if "score" not in grade_data:
                continue
                
            # Get the maximum possible score for this question
            max_score = question.get("points", 1)
            given_score = min(max(0, float(grade_data["score"])), max_score)  # Constrain score to valid range
            
            # Update the answer
            if question_id in submission.get("answers", {}):
                answer = submission["answers"][question_id]
                
                # Calculate score change
                old_answer_score = answer.get("score", 0)
                score_change += given_score - old_answer_score
                
                # Update with grade data
                answer.update({
                    "score": given_score,
                    "maxScore": max_score,
                    "isGraded": True,
                    "feedback": grade_data.get("feedback", "")
                })
                
                submission["answers"][question_id] = answer
        
        # Update overall score
        submission["score"] = old_score + score_change
        
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
                "msg": "Subjective questions graded successfully",
                "newScore": submission["score"],
                "maxScore": submission["maxScore"],
                "percentage": round((submission["score"] / submission["maxScore"]) * 100, 1) if submission["maxScore"] > 0 else 0
            }), 200
        
        return jsonify({"msg": "No changes made"}), 200
        
    except Exception as e:
        print(f"Error grading subjective questions: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

@app.route("/api/quiz/question-types", methods=["GET"])
@jwt_required()
def get_question_types():
    """Get available quiz question types and their structure"""
    user_id = get_jwt_identity()
    
    # Verify user is a teacher
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user or user.get("userType") != "teacher":
        return jsonify({"msg": "Only teachers can access this information"}), 403
    
    # Define the available question types and their structure
    question_types = {
        "single_choice": {
            "name": "Single Choice",
            "description": "Multiple choice question with exactly one correct answer",
            "fields": {
                "text": "Question text",
                "options": "Array of options with id and text properties",
                "correctOption": "ID of the correct option",
                "points": "Points awarded for correct answer (default: 1)"
            },
            "example": {
                "text": "What is the capital of France?",
                "type": "single_choice",
                "options": [
                    {"id": "opt1", "text": "London"},
                    {"id": "opt2", "text": "Paris"},
                    {"id": "opt3", "text": "Berlin"}
                ],
                "correctOption": "opt2",
                "points": 1
            }
        },
        "multiple_choice": {
            "name": "Multiple Choice",
            "description": "Multiple choice question with multiple correct answers",
            "fields": {
                "text": "Question text",
                "options": "Array of options with id and text properties",
                "correctOptions": "Array of IDs of correct options",
                "points": "Points awarded for fully correct answer (default: 1)"
            },
            "example": {
                "text": "Which of the following are primary colors?",
                "type": "multiple_choice",
                "options": [
                    {"id": "opt1", "text": "Red"},
                    {"id": "opt2", "text": "Green"},
                    {"id": "opt3", "text": "Blue"},
                    {"id": "opt4", "text": "Purple"}
                ],
                "correctOptions": ["opt1", "opt3"],
                "points": 2
            }
        },
        "subjective": {
            "name": "Subjective",
            "description": "Open-ended question requiring manual grading",
            "fields": {
                "text": "Question text",
                "modelAnswer": "Optional model answer for reference",
                "points": "Maximum points possible (default: 1)"
            },
            "example": {
                "text": "Explain the significance of the water cycle.",
                "type": "subjective",
                "modelAnswer": "The water cycle is important because it purifies water, replenishes the land with freshwater, and regulates weather patterns...",
                "points": 5
            }
        }
    }
    
    return jsonify({
        "questionTypes": question_types,
        "defaultType": "single_choice"
    }), 200

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/pending-grades", methods=["GET"])
@jwt_required()
def get_pending_grades(classroom_id, quiz_id):
    """Get submissions with subjective questions that need manual grading"""
    user_id = get_jwt_identity()
    
    classroom, user, error = get_classroom_and_validate_access(classroom_id, user_id, "teacher")
    if error:
        return error
    
    try:
        # Find the quiz
        quiz = find_quiz_by_id(classroom, quiz_id)
        if not quiz:
            return jsonify({"msg": "Quiz not found"}), 404
        
        # Check if the quiz has subjective questions
        has_subjective = any(q.get("type") == "subjective" for q in quiz.get("questions", []))
        if not has_subjective:
            return jsonify({
                "needsGrading": False,
                "submissions": []
            }), 200
        
        # Find submissions that need grading
        submissions_need_grading = []
        
        for submission in quiz.get("submissions", []):
            student_id = submission.get("student_id")
            student = users_collection.find_one({"_id": student_id})
            
            # Check if any subjective questions are ungraded
            pending_questions = []
            
            for question in quiz.get("questions", []):
                if question.get("type") != "subjective":
                    continue
                    
                question_id = str(question.get("id"))
                
                # Check if this question has been answered and needs grading
                answer = submission.get("answers", {}).get(question_id, {})
                if question_id in submission.get("answers", {}) and not answer.get("isGraded", False):
                    # This question needs grading
                    pending_questions.append({
                        "questionId": question_id,
                        "questionText": question.get("text", ""),
                        "answerText": answer.get("answer", ""),
                        "modelAnswer": question.get("modelAnswer", ""),
                        "maxPoints": question.get("points", 1)
                    })
            
            if pending_questions:
                submissions_need_grading.append({
                    "submissionId": str(student_id),
                    "studentName": student.get("fullName", "Unknown") if student else "Unknown",
                    "studentEmail": student.get("email", "") if student else "",
                    "submittedAt": submission.get("endTime"),
                    "currentScore": submission.get("score", 0),
                    "maxScore": submission.get("maxScore", 0),
                    "pendingQuestions": pending_questions
                })
        
        return jsonify({
            "needsGrading": len(submissions_need_grading) > 0,
            "submissions": mongo_to_json_serializable(submissions_need_grading)
        }), 200
        
    except Exception as e:
        print(f"Error getting pending grades: {str(e)}")
        return jsonify({"msg": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)