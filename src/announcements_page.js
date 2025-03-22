// NOTE: This file is being deprecated in favor of student_classroom.js
// It remains here for backward compatibility

document.addEventListener('DOMContentLoaded', function() {
  // Redirect to student_classroom.html with the same classId
  const urlParams = new URLSearchParams(window.location.search);
  const classId = urlParams.get('classId');
  if (classId) {
    window.location.href = `/student_classroom.html?classId=${classId}`;
  } else {
    // If no classId is provided, redirect to dashboard
    window.location.href = '/dashboard';
  }
  
  // Original code below is kept for backward compatibility
  // Toggle sidebar
  document.getElementById('hamburger').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('expanded');
  });

  // Profile dropdown
  document.querySelector('.profile-icon').addEventListener('click', function() {
    document.querySelector('.profile-dropdown').classList.toggle('show');
  });

  // Click outside to close dropdown
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
      document.querySelector('.profile-dropdown').classList.remove('show');
    }
  });

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
});