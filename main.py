import os
from flask import Flask, send_file, redirect, url_for

app = Flask(__name__, static_folder="src", static_url_path="")

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
    # Redirect to the signup page
    return redirect(url_for('signup'))

# New route: Teacher Dashboard (after successful login)
@app.route("/teacher_dashboard")
def teacher_dashboard():
    # TODO: Add logic here to verify teacher login credentials before serving the page
    return send_file('src/teacher_after_login.html')

# New route: Teacher Profile Page
@app.route("/teacher_profile")
def teacher_profile():
    # TODO: Add authentication/authorization logic here before serving the profile page
    return send_file('src/teacher_profile_page.html')

@app.route("/student_dashboard")
def student_dashboard():
    return send_file('src/student_dashboard.html')

@app.route("/student_profile")
def student_profile():
    return send_file('src/student_profile_page.html')

@app.route("/announcements")
def announcements():
    return send_file('src/announcements_page").html')

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
