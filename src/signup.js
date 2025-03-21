document.addEventListener('DOMContentLoaded', function() {
  // Initialize AOS animation library
  AOS.init({
    duration: 1000,
    once: true,
    offset: 50
  });
  
  // Initialize Particles.js
  particlesJS("particles-js", {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.5, random: true },
      size: { value: 3, random: true },
      line_linked: {
        enable: true,
        distance: 150,
        color: "#ffffff",
        opacity: 0.4,
        width: 1
      },
      move: {
        enable: true,
        speed: 2,
        direction: "none",
        random: true,
        straight: false,
        out_mode: "out",
        bounce: false
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "grab" },
        onclick: { enable: true, mode: "push" },
        resize: true
      },
      modes: {
        grab: { distance: 140, line_linked: { opacity: 1 } },
        push: { particles_nb: 4 }
      }
    },
    retina_detect: true
  });
  
  // Setup input validation
  setupFormValidation();
  
  // Setup password strength
  setupPasswordStrength();
});

// ORIGINAL FUNCTIONS

function showTab(tab) {
// Hide all tab contents
document.getElementById('teacher').classList.remove('active');
document.getElementById('student').classList.remove('active');

// Show the selected tab content
document.getElementById(tab).classList.add('active');

// Update tab buttons
document.getElementById('teacherTab').classList.remove('active');
document.getElementById('studentTab').classList.remove('active');
document.getElementById(tab + 'Tab').classList.add('active');

// Update tab indicator
const tabButtonsContainer = document.getElementById('tabButtonsContainer');
if (tab === 'student') {
  tabButtonsContainer.classList.add('student-active');
} else {
  tabButtonsContainer.classList.remove('student-active');
}
}

function sendVerification(emailFieldId, userType) {
const emailField = document.getElementById(emailFieldId);
const email = emailField.value;

if (email && validateEmail(email)) {
  // Show loading state on button
  const button = event.target;
  const originalText = button.textContent;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  button.disabled = true;
  
  // Simulate API call with timeout
  setTimeout(() => {
    button.innerHTML = '<i class="fas fa-check"></i> Sent!';
    
    // Reset button after 3 seconds
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 3000);
    
    // Show notification
    showNotification(`Verification code sent to ${email}`, 'success');
  }, 1500);
  
} else {
  if (!email) {
    showNotification('Please enter your email address first.', 'error');
  } else {
    showNotification('Please enter a valid email address.', 'error');
  }
  emailField.focus();
}
}

function validateEmail(email) {
const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
return re.test(email);
}

function setupFormValidation() {
// Input fields to validate
const fields = [
  { id: 'teacherName', validate: (val) => val.length >= 3 },
  { id: 'teacherOrg', validate: (val) => val.length >= 2 },
  { id: 'teacherEmail', validate: validateEmail },
  { id: 'studentName', validate: (val) => val.length >= 3 },
  { id: 'studentOrg', validate: (val) => val.length >= 2 },
  { id: 'studentEmail', validate: validateEmail }
];

fields.forEach(field => {
  const el = document.getElementById(field.id);
  if (!el) return;
  
  el.addEventListener('input', () => {
    const formControl = el.closest('.form-control');
    if (field.validate(el.value)) {
      formControl.classList.add('valid');
    } else {
      formControl.classList.remove('valid');
    }
  });
  
  el.addEventListener('blur', () => {
    const formControl = el.closest('.form-control');
    if (el.value && !field.validate(el.value)) {
      formControl.classList.add('invalid');
      formControl.classList.remove('valid');
    } else {
      formControl.classList.remove('invalid');
    }
  });
});
}

function setupPasswordStrength() {
const passwords = [
  { inputId: 'teacherPassword', barId: 'teacherPasswordStrength', textId: 'teacherPasswordStrengthText' },
  { inputId: 'studentPassword', barId: 'studentPasswordStrength', textId: 'studentPasswordStrengthText' }
];

passwords.forEach(pass => {
  const passwordInput = document.getElementById(pass.inputId);
  const strengthBar = document.getElementById(pass.barId);
  const strengthText = document.getElementById(pass.textId);
  
  passwordInput.addEventListener('input', () => {
    const strength = checkPasswordStrength(passwordInput.value);
    
    // Update strength bar
    strengthBar.style.width = strength.score * 25 + '%';
    strengthBar.style.backgroundColor = strength.color;
    
    // Update text
    strengthText.textContent = strength.text;
    strengthText.style.color = strength.color;
    
    // Update valid state
    const formControl = passwordInput.closest('.form-control');
    if (strength.score >= 2) {
      formControl.classList.add('valid');
    } else {
      formControl.classList.remove('valid');
    }
  });
});
}

function checkPasswordStrength(password) {
let score = 0;

if (password.length > 6) score++;
if (password.length > 10) score++;
if (/\d/.test(password)) score++;
if (/[A-Z]/.test(password)) score++;
if (/[!@#$%^&*]/.test(password)) score++;

// Cap at 4
score = Math.min(score, 4);

const results = [
  { score: 0, text: '', color: '#e0e0e0' },
  { score: 1, text: 'Weak', color: '#f44336' },
  { score: 2, text: 'Fair', color: '#ff9800' },
  { score: 3, text: 'Good', color: '#2196f3' },
  { score: 4, text: 'Strong', color: '#4caf50' }
];

return results[score];
}

function showNotification(message, type) {
// Create notification element
const notification = document.createElement('div');
notification.className = 'notification ' + type;
notification.innerHTML = `
  <div class="notification-content">
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${message}</span>
  </div>
`;

// Style the notification
Object.assign(notification.style, {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  backgroundColor: type === 'success' ? '#4CAF50' : '#F44336',
  color: 'white',
  padding: '12px 20px',
  borderRadius: '4px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  zIndex: '1000',
  display: 'flex',
  alignItems: 'center',
  minWidth: '200px',
  maxWidth: '400px',
  transform: 'translateX(120%)',
  transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  fontFamily: "'Roboto', sans-serif"
});

// Add to DOM
document.body.appendChild(notification);

// Trigger animation
setTimeout(() => {
  notification.style.transform = 'translateX(0)';
}, 10);

// Remove after timeout
setTimeout(() => {
  notification.style.transform = 'translateX(120%)';
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 400);
}, 4000);
}

// NEW CODE: Attach event listeners to intercept teacher and student signup form submissions and call API endpoints
document.addEventListener('DOMContentLoaded', function() {
const teacherForm = document.getElementById('teacherForm');
const studentForm = document.getElementById('studentForm');

teacherForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const name = document.getElementById('teacherName').value;
  const organization = document.getElementById('teacherOrg').value;
  const email = document.getElementById('teacherEmail').value;
  const password = document.getElementById('teacherPassword').value;

  const data = {
    fullName: name,
    email: email,
    password: password,
    institution: organization,
    userType: "teacher"
  };

  fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.msg === "Signup successful") {
      loginUser(email, password); // Auto-login after successful signup
    } else {
      alert(result.msg || "Signup failed.");
    }
  })
  .catch(err => {
    console.error(err);
    alert("Error during signup.");
  });
});

studentForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const name = document.getElementById('studentName').value;
  const organization = document.getElementById('studentOrg').value;
  const email = document.getElementById('studentEmail').value;
  const password = document.getElementById('studentPassword').value;

  const data = {
    fullName: name,
    email: email,
    password: password,
    institution: organization,
    userType: "student"
  };

  fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.msg === "Signup successful") {
      loginUser(email, password);
    } else {
      alert(result.msg || "Signup failed.");
    }
  })
  .catch(err => {
    console.error(err);
    alert("Error during signup.");
  });
});

function loginUser(email, password) {
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  })
  .then(response => response.json())
  .then(result => {
    if (result.access_token) {
      localStorage.setItem('access_token', result.access_token);
      if (result.userType === "teacher") {
        window.location.href = "/teacher_profile";
      } else {
        window.location.href = "/profile";
      }
    } else {
      alert(result.msg || "Login failed.");
    }
  })
  .catch(err => {
    console.error(err);
    alert("Error during login.");
  });
}
});
