// Sidebar toggle functionality
document.getElementById('hamburger').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('expanded');
});

// Profile dropdown functionality
document.querySelector('.profile-icon').addEventListener('click', function() {
    document.querySelector('.profile-dropdown').classList.toggle('show');
});

// Click outside to close dropdown
document.addEventListener('click', function(event) {
    if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
        document.querySelector('.profile-dropdown').classList.remove('show');
    }
});

// Tab switching functionality
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

// Announcement posting functionality
document.querySelector('.announcement-composer .btn').addEventListener('click', function() {
    const textarea = document.querySelector('.announcement-composer textarea');
    const text = textarea.value.trim();
    
    if (text) {
        const announcement = document.createElement('div');
        announcement.className = 'announcement';
        announcement.innerHTML = `
            <h3>New Announcement</h3>
            <p>${text}</p>
            <span class="date"><i class="far fa-calendar-alt"></i> ${new Date().toLocaleString()}</span>
        `;
        document.querySelector('#announcements').insertBefore(announcement, document.querySelector('.announcement-composer').nextSibling);
        textarea.value = '';
        alert('Announcement posted!');
    } else {
        alert('Please enter an announcement.');
    }
});

// Doubt response functionality (placeholder)
document.querySelectorAll('.doubt .btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const response = prompt('Enter your response:');
        if (response) {
            alert('Response sent to student: ' + response);
        }
    });
});