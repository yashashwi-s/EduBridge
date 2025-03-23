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
                "Provide clear instructions with clickable links (in HTML) for common actions such as 'View Courses' or 'Check Calendar'."
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
    hashed_pw = generate_password_hash(data.get("password"))
    user = {
        "fullName": data.get("fullName"),
        "email": email,
        "password": hashed_pw,
        "phone": data.get("phone", ""),
        "institution": data.get("institution", ""),
        "department": data.get("department", ""),
        "title": data.get("title", ""),
        "bio": data.get("bio", ""),
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
    users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    return jsonify({"msg": "Profile updated"}), 200

BACKGROUND_IMAGES = [
    'https://www.gstatic.com/classroom/themes/img_graduation.jpg',
    'https://www.gstatic.com/classroom/themes/img_code.jpg',
    'https://www.gstatic.com/classroom/themes/img_bookclub.jpg',
    'https://www.gstatic.com/classroom/themes/img_breakfast.jpg',
    'https://www.gstatic.com/classroom/themes/img_reachout.jpg',
    'https://www.gstatic.com/classroom/themes/img_learnlanguage.jpg'
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
@app.route("/api/classrooms/<classroom_id>/quizzes", methods=["GET"])
@jwt_required()
def get_classroom_quizzes(classroom_id):
    """Get all quizzes for a classroom - for teacher view"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is the teacher of this classroom
    if user["userType"] != "teacher" or classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to view these quizzes"}), 403
    
    quizzes = classroom.get("quizzes", [])
    processed_quizzes = []
    
    for quiz in quizzes:
        # Add student names to submissions
        if "submissions" in quiz:
            for submission in quiz["submissions"]:
                student = users_collection.find_one({"_id": submission["student_id"]})
                submission["studentName"] = student["fullName"] if student else "Unknown"
        
        processed_quizzes.append(quiz)
    
    # Convert to JSON serializable format
    processed_quizzes = mongo_to_json_serializable(processed_quizzes)
    return jsonify(processed_quizzes), 200

@app.route("/api/classrooms/<classroom_id>/quizzes", methods=["POST"])
@jwt_required()
def create_classroom_quiz(classroom_id):
    """Create a new quiz for a classroom"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is the teacher of this classroom
    if user["userType"] != "teacher" or classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to create a quiz"}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({"msg": "Quiz data is required"}), 400
    
    # Validate required fields
    required_fields = ["title", "description", "startTime", "endTime", "duration", "questions"]
    for field in required_fields:
        if field not in data:
            return jsonify({"msg": f"Missing required field: {field}"}), 400
    
    # Validate questions
    questions = data["questions"]
    if not questions or not isinstance(questions, list) or len(questions) == 0:
        return jsonify({"msg": "At least one question is required"}), 400
    
    # Process and validate each question
    processed_questions = []
    for i, question in enumerate(questions):
        if "text" not in question or "options" not in question or "correctOption" not in question:
            return jsonify({"msg": f"Question {i+1} is missing required fields"}), 400
        
        # Process options
        processed_options = []
        for option in question["options"]:
            if "text" not in option:
                return jsonify({"msg": f"Option in question {i+1} is missing text field"}), 400
            
            # Add IDs to options if not present
            option_id = option.get("id", str(ObjectId()))
            processed_options.append({
                "id": option_id,
                "text": option["text"]
            })
        
        # Add IDs to questions if not present
        question_id = question.get("id", str(ObjectId()))
        processed_questions.append({
            "id": question_id,
            "text": question["text"],
            "options": processed_options,
            "correctOption": question["correctOption"]
        })
    
    # Create quiz object
    try:
        start_time = datetime.fromisoformat(data["startTime"])
        end_time = datetime.fromisoformat(data["endTime"])
    except ValueError:
        return jsonify({"msg": "Invalid date format for startTime or endTime"}), 400
    
    quiz = {
        "id": ObjectId(),
        "title": data["title"],
        "description": data["description"],
        "startTime": start_time,
        "endTime": end_time,
        "duration": int(data["duration"]),
        "published": data.get("published", True),
        "questions": processed_questions,
        "submissions": []
    }
    
    # Add quiz to classroom
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id)},
        {"$push": {"quizzes": quiz}}
    )
    
    if result.modified_count:
        # Convert to JSON-serializable format
        response_quiz = {
            "id": str(quiz["id"]),
            "title": quiz["title"],
            "description": quiz["description"],
            "startTime": quiz["startTime"].isoformat(),
            "endTime": quiz["endTime"].isoformat(),
            "duration": quiz["duration"],
            "published": quiz.get("published", True),
            "questions": processed_questions
        }
        return jsonify({"msg": "Quiz created", "quiz": response_quiz}), 201
    
    return jsonify({"msg": "Failed to create quiz"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>", methods=["PUT"])
@jwt_required()
def update_classroom_quiz(classroom_id, quiz_id):
    """Update an existing quiz"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is the teacher of this classroom
    if user["userType"] != "teacher" or classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to update this quiz"}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({"msg": "Quiz data is required"}), 400
    
    # Find the quiz
    quiz_index = None
    for i, quiz in enumerate(classroom.get("quizzes", [])):
        if str(quiz["id"]) == quiz_id:
            quiz_index = i
            break
    
    if quiz_index is None:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Handle questions update
    if "questions" in data:
        questions = data["questions"]
        if not questions or not isinstance(questions, list) or len(questions) == 0:
            return jsonify({"msg": "At least one question is required"}), 400
        
        # Process and validate each question
        processed_questions = []
        for i, question in enumerate(questions):
            if "text" not in question or "options" not in question or "correctOption" not in question:
                return jsonify({"msg": f"Question {i+1} is missing required fields"}), 400
            
            # Process options
            processed_options = []
            for option in question["options"]:
                if "text" not in option:
                    return jsonify({"msg": f"Option in question {i+1} is missing text field"}), 400
                
                # Add IDs to options if not present
                option_id = option.get("id", str(ObjectId()))
                processed_options.append({
                    "id": option_id,
                    "text": option["text"]
                })
            
            # Add IDs to questions if not present
            question_id = question.get("id", str(ObjectId()))
            processed_questions.append({
                "id": question_id,
                "text": question["text"],
                "options": processed_options,
                "correctOption": question["correctOption"]
            })
        
        # Update quiz with processed questions
        data["questions"] = processed_questions
    
    # Update the quiz directly in the array
    try:
        if "startTime" in data:
            data["startTime"] = datetime.fromisoformat(data["startTime"])
        if "endTime" in data:
            data["endTime"] = datetime.fromisoformat(data["endTime"])
        if "duration" in data:
            data["duration"] = int(data["duration"])
    except ValueError:
        return jsonify({"msg": "Invalid date format for startTime or endTime"}), 400
    
    # Create updated quiz object by combining existing data with updates
    updated_quiz = classroom["quizzes"][quiz_index].copy()
    
    # Update fields that were provided
    for field in ["title", "description", "startTime", "endTime", "duration", "published", "questions"]:
        if field in data:
            updated_quiz[field] = data[field]
    
    # Replace the quiz in the array
    classroom["quizzes"][quiz_index] = updated_quiz
    
    # Update the classroom document
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id)},
        {"$set": {"quizzes": classroom["quizzes"]}}
    )
    
    if result.modified_count:
        # Convert to JSON-serializable format for response
        response_quiz = {
            "id": str(updated_quiz["id"]),
            "title": updated_quiz["title"],
            "description": updated_quiz["description"],
            "startTime": updated_quiz["startTime"].isoformat(),
            "endTime": updated_quiz["endTime"].isoformat(),
            "duration": updated_quiz["duration"],
            "published": updated_quiz.get("published", True),
            "questions": updated_quiz["questions"]
        }
        return jsonify({"msg": "Quiz updated", "quiz": response_quiz}), 200
    
    return jsonify({"msg": "Failed to update quiz"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>", methods=["DELETE"])
@jwt_required()
def delete_classroom_quiz(classroom_id, quiz_id):
    """Delete a quiz"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is the teacher of this classroom
    if user["userType"] != "teacher" or classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to delete this quiz"}), 403
    
    # Find the quiz by ID
    quiz_to_delete = None
    for quiz in classroom.get("quizzes", []):
        if str(quiz["id"]) == quiz_id:
            quiz_to_delete = quiz
            break
    
    if not quiz_to_delete:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Delete the quiz by filtering the array
    updated_quizzes = [quiz for quiz in classroom["quizzes"] if str(quiz["id"]) != quiz_id]
    
    # Update the classroom with the filtered array
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id)},
        {"$set": {"quizzes": updated_quizzes}}
    )
    
    if result.modified_count:
        return jsonify({"msg": "Quiz deleted successfully"}), 200
    else:
        return jsonify({"msg": "No changes made"}), 200

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/results", methods=["GET"])
@jwt_required()
def get_quiz_results(classroom_id, quiz_id):
    """Get results for a quiz - for teacher view"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is the teacher of this classroom
    if user["userType"] != "teacher" or classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to view these results"}), 403
    
    # Find the quiz
    quiz = None
    for q in classroom.get("quizzes", []):
        if str(q["id"]) == quiz_id:
            quiz = q
            break
    
    if not quiz:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Process submissions data
    submissions = []
    for submission in quiz.get("submissions", []):
        student = users_collection.find_one({"_id": submission["student_id"]})
        submission_copy = submission.copy()
        submission_copy["studentName"] = student["fullName"] if student else "Unknown"
        submission_copy["percentage"] = round((submission["score"] / submission["maxScore"]) * 100, 1) if submission["maxScore"] > 0 else 0
        submissions.append(submission_copy)
    
    # Calculate statistics
    stats = {
        "submissions": len(submissions),
        "averageScore": 0,
        "highestScore": 0,
        "lowestScore": 100
    }
    
    if submissions:
        score_sum = sum(s["percentage"] for s in submissions)
        stats["averageScore"] = round(score_sum / len(submissions), 1)
        stats["highestScore"] = max(s["percentage"] for s in submissions)
        stats["lowestScore"] = min(s["percentage"] for s in submissions)
    
    result = {
        "quizTitle": quiz["title"],
        "quizDescription": quiz["description"],
        "totalQuestions": len(quiz["questions"]),
        "submissions": submissions,
        "statistics": stats
    }
    
    # Convert to JSON serializable format
    result = mongo_to_json_serializable(result)
    return jsonify(result), 200

# Student-facing quiz routes
@app.route("/api/classrooms/<classroom_id>/quizzes/student", methods=["GET"])
@jwt_required()
def get_student_quizzes(classroom_id):
    """Get all quizzes for a classroom - for student view"""
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is enrolled in this classroom
    if ObjectId(user_id) not in classroom.get("enrolled_students", []) and classroom["teacher_id"] != ObjectId(user_id):
        return jsonify({"msg": "Unauthorized to view these quizzes"}), 403
    
    quizzes = classroom.get("quizzes", [])
    processed_quizzes = []
    
    current_time = datetime.utcnow()
    
    for quiz in quizzes:
        # Check if quiz is published
        if not quiz.get("published", True):
            continue
            
        # Determine student status for this quiz
        quiz_start = quiz["startTime"]
        quiz_end = quiz["endTime"]
        
        # Check if student has already submitted this quiz
        has_submitted = False
        for submission in quiz.get("submissions", []):
            if submission["student_id"] == ObjectId(user_id):
                has_submitted = True
                break
                
        if has_submitted:
            student_status = "submitted"
        elif current_time < quiz_start:
            student_status = "upcoming"
        elif current_time > quiz_end:
            student_status = "missed"
        elif current_time >= quiz_start and current_time <= quiz_end:
            student_status = "available"
        
        # Create a student-friendly version of the quiz (no correct answers)
        student_quiz = {
            "id": quiz["id"],
            "title": quiz["title"],
            "description": quiz["description"],
            "startTime": quiz["startTime"],
            "endTime": quiz["endTime"],
            "duration": quiz["duration"],
            "studentStatus": student_status,
            "questions": []
        }
        
        # Include questions but remove correctOption field
        for question in quiz["questions"]:
            student_question = {
                "id": question["id"],
                "text": question["text"],
                "options": [{"id": option["id"], "text": option["text"]} for option in question["options"]]
            }
            student_quiz["questions"].append(student_question)
        
        processed_quizzes.append(student_quiz)
    
    # Convert to JSON serializable format
    processed_quizzes = mongo_to_json_serializable(processed_quizzes)
    return jsonify(processed_quizzes), 200

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/start", methods=["POST"])
@jwt_required()
def start_quiz(classroom_id, quiz_id):
    """Mark a quiz as started by a student"""
    user_id = get_jwt_identity()
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is enrolled in this classroom
    if ObjectId(user_id) not in classroom.get("enrolled_students", []):
        return jsonify({"msg": "Unauthorized to start this quiz"}), 403
    
    # Find the quiz
    quiz = None
    for q in classroom.get("quizzes", []):
        if str(q["id"]) == quiz_id:
            quiz = q
            break
    
    if not quiz:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Check if quiz is available
    current_time = datetime.utcnow()
    quiz_start = quiz["startTime"]
    quiz_end = quiz["endTime"]
    
    if current_time < quiz_start:
        return jsonify({"msg": "This quiz is not available yet"}), 400
    
    if current_time > quiz_end:
        return jsonify({"msg": "This quiz has ended"}), 400
    
    # Check if student has already submitted this quiz
    for submission in quiz.get("submissions", []):
        if submission["student_id"] == ObjectId(user_id):
            return jsonify({"msg": "You have already submitted this quiz"}), 400
    
    return jsonify({"msg": "Quiz started successfully"}), 200

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/submit", methods=["POST"])
@jwt_required()
def submit_quiz(classroom_id, quiz_id):
    """Submit a quiz with student answers"""
    user_id = get_jwt_identity()
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is enrolled in this classroom
    if ObjectId(user_id) not in classroom.get("enrolled_students", []):
        return jsonify({"msg": "Unauthorized to submit this quiz"}), 403
    
    # Find the quiz
    quiz = None
    quiz_index = -1
    for i, q in enumerate(classroom.get("quizzes", [])):
        if str(q["id"]) == quiz_id:
            quiz = q
            quiz_index = i
            break
    
    if not quiz:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Check if quiz is still available
    current_time = datetime.utcnow()
    quiz_end = quiz["endTime"]
    
    if current_time > quiz_end:
        return jsonify({"msg": "This quiz has ended"}), 400
    
    # Check if student has already submitted this quiz
    for submission in quiz.get("submissions", []):
        if submission["student_id"] == ObjectId(user_id):
            return jsonify({"msg": "You have already submitted this quiz"}), 400
    
    # Get submitted answers
    data = request.get_json()
    if not data or "answers" not in data:
        return jsonify({"msg": "No answers provided"}), 400
    
    # Create a mapping of questions by ID for easy lookup
    questions_map = {question["id"]: question for question in quiz["questions"]}
    
    # Score the quiz
    total_questions = len(quiz["questions"])
    correct_count = 0
    scored_answers = {}
    
    for question_id, selected_option_id in data["answers"].items():
        question = questions_map.get(question_id)
        if not question:
            continue
        
        # Find the selected option
        selected_option = None
        for option in question["options"]:
            if option["id"] == selected_option_id:
                selected_option = option
                break
        
        is_correct = question["correctOption"] == selected_option_id if selected_option else False
        if is_correct:
            correct_count += 1
        
        scored_answers[question_id] = {
            "selected": selected_option_id,
            "correct": question["correctOption"],
            "isCorrect": is_correct
        }
    
    # Calculate score (1 point per correct answer)
    score = correct_count
    max_score = total_questions
    
    # Create submission object
    submission = {
        "student_id": ObjectId(user_id),
        "startTime": datetime.fromisoformat(data.get("startTime")) if "startTime" in data else current_time,
        "endTime": current_time,
        "score": score,
        "maxScore": max_score,
        "answers": scored_answers
    }
    
    # Add submission to quiz
    result = classrooms_collection.update_one(
        {"_id": ObjectId(classroom_id), "quizzes.id": ObjectId(quiz_id)},
        {"$push": {"quizzes.$.submissions": submission}}
    )
    
    if result.modified_count:
        # Prepare results for student
        questions_with_answers = []
        
        for question in quiz["questions"]:
            question_id = question["id"]
            answer_data = scored_answers.get(question_id, {})
            
            question_result = {
                "id": question_id,
                "text": question["text"],
                "isCorrect": answer_data.get("isCorrect", False),
                "options": [],
                "userAnswer": answer_data.get("selected"),
                "correctAnswer": answer_data.get("correct")
            }
            
            for option in question["options"]:
                option_data = {
                    "id": option["id"],
                    "text": option["text"],
                    "isCorrect": option["id"] == answer_data.get("correct", None)
                }
                question_result["options"].append(option_data)
            
            questions_with_answers.append(question_result)
        
        results = {
            "score": score,
            "totalPossible": max_score,
            "percentage": round((score / max_score) * 100, 1) if max_score > 0 else 0,
            "correctCount": correct_count,
            "totalQuestions": total_questions,
            "questions": questions_with_answers
        }
        
        return jsonify(results), 200
    
    return jsonify({"msg": "Failed to submit quiz"}), 500

@app.route("/api/classrooms/<classroom_id>/quizzes/<quiz_id>/results/student", methods=["GET"])
@jwt_required()
def get_student_quiz_results(classroom_id, quiz_id):
    """Get a student's results for a specific quiz"""
    user_id = get_jwt_identity()
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    
    # Check if user is enrolled in this classroom
    if ObjectId(user_id) not in classroom.get("enrolled_students", []):
        return jsonify({"msg": "Unauthorized to view these results"}), 403
    
    # Find the quiz
    quiz = None
    for q in classroom.get("quizzes", []):
        if str(q["id"]) == quiz_id:
            quiz = q
            break
    
    if not quiz:
        return jsonify({"msg": "Quiz not found"}), 404
    
    # Find student submission
    submission = None
    for sub in quiz.get("submissions", []):
        if sub["student_id"] == ObjectId(user_id):
            submission = sub
            break
    
    if not submission:
        return jsonify({"msg": "You have not submitted this quiz"}), 404
    
    # Prepare results for student
    questions_with_answers = []
    
    for question in quiz["questions"]:
        question_id = question["id"]
        answer_data = submission["answers"].get(question_id, {})
        
        question_result = {
            "id": question_id,
            "text": question["text"],
            "isCorrect": answer_data.get("isCorrect", False),
            "options": [],
            "userAnswer": answer_data.get("selected"),
            "correctAnswer": answer_data.get("correct")
        }
        
        for option in question["options"]:
            option_data = {
                "id": option["id"],
                "text": option["text"],
                "isCorrect": option["id"] == answer_data.get("correct", None)
            }
            question_result["options"].append(option_data)
        
        questions_with_answers.append(question_result)
    
    results = {
        "score": submission["score"],
        "totalPossible": submission["maxScore"],
        "percentage": round((submission["score"] / submission["maxScore"]) * 100, 1) if submission["maxScore"] > 0 else 0,
        "correctCount": sum(1 for q in questions_with_answers if q["isCorrect"]),
        "totalQuestions": len(quiz["questions"]),
        "questions": questions_with_answers
    }
    
    return jsonify(results), 200

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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
