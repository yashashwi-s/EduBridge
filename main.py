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

load_dotenv()
app = Flask(__name__, template_folder="src", static_folder="src", static_url_path="")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise Exception("GEMINI_API_KEY not set in .env file")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret-key")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)
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
    return jsonify({"msg": "Login successful", "access_token": access_token, "userType": user["userType"]}), 200

@app.route("/api/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404
    user["_id"] = str(user["_id"])
    user.pop("password", None)
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
        c["_id"] = str(c["_id"])
        c["teacher_id"] = str(c["teacher_id"])
        c["createdAt"] = c["createdAt"].isoformat()
        c["enrolled_students"] = [str(s) for s in c.get("enrolled_students", [])]
        c["headerImage"] = c.get("headerImage", random.choice(BACKGROUND_IMAGES))
        if "announcements" in c:
            for ann in c["announcements"]:
                ann["announcement_id"] = str(ann["announcement_id"])
                ann["teacher_id"] = str(ann["teacher_id"])
                ann["postTime"] = ann["postTime"].isoformat()
                for comment in ann.get("comments", []):
                    cid = comment["commenter_id"]
                    comment["commenter_id"] = str(cid)
                    comment["commentTime"] = comment["commentTime"].isoformat()
                    user_obj = users_collection.find_one({"_id": cid})
                    comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
        classrooms.append(c)
    return jsonify(classrooms), 200

@app.route("/api/classrooms/<classroom_id>", methods=["GET"])
@jwt_required()
def get_classroom(classroom_id):
    classroom = classrooms_collection.find_one({"_id": ObjectId(classroom_id)})
    if not classroom:
        return jsonify({"msg": "Classroom not found"}), 404
    teacher = users_collection.find_one({"_id": classroom["teacher_id"]})
    classroom["teacherName"] = teacher["fullName"] if teacher else ""
    classroom["_id"] = str(classroom["_id"])
    classroom["teacher_id"] = str(classroom["teacher_id"])
    classroom["createdAt"] = classroom["createdAt"].isoformat()
    classroom["enrolled_students"] = [str(s) for s in classroom.get("enrolled_students", [])]
    if "announcements" in classroom:
        for ann in classroom["announcements"]:
            ann["announcement_id"] = str(ann["announcement_id"])
            ann["teacher_id"] = str(ann["teacher_id"])
            ann["postTime"] = ann["postTime"].isoformat()
            for comment in ann.get("comments", []):
                cid = comment["commenter_id"]
                comment["commenter_id"] = str(cid)
                comment["commentTime"] = comment["commentTime"].isoformat()
                user_obj = users_collection.find_one({"_id": cid})
                comment["commenterName"] = user_obj["fullName"] if user_obj else "Unknown"
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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
