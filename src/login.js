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

// NEW CODE: Intercept teacher and student login form submissions and call API endpoints
document.addEventListener('DOMContentLoaded', function() {
  const teacherForm = document.getElementById('teacherForm');
  const studentForm = document.getElementById('studentForm');

  teacherForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = document.getElementById('teacherEmail').value;
      const password = document.getElementById('teacherPassword').value;
      loginUser(email, password);
  });

  studentForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = document.getElementById('studentEmail').value;
      const password = document.getElementById('studentPassword').value;
      loginUser(email, password);
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
              // Validate token format before storing
              const token = result.access_token;
              const segments = token.split('.');
              
              if (segments.length !== 3) {
                  console.error('Invalid JWT token format:', token);
                  alert("Server returned an invalid token. Please contact support.");
                  return;
              }
              
              console.log('Token validation passed, storing token and redirecting...');
              // Store token in both formats for compatibility
              localStorage.setItem('access_token', token);
              localStorage.setItem('accessToken', token);
              
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
