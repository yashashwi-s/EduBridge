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