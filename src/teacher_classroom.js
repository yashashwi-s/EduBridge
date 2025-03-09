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
document.addEventListener('DOMContentLoaded', function() {
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

// Fix for announcement posting (combining both original implementations)
document.addEventListener('DOMContentLoaded', function() {
    // Get the textarea and post button
    const composerTextarea = document.querySelector('.announcement-composer textarea');
    const postBtn = document.querySelector('.announcement-composer .post-btn');

    // Disable/enable post button based on textarea content
    if (composerTextarea && postBtn) {
        composerTextarea.addEventListener('input', function() {
            postBtn.disabled = this.value.trim() === '';
        });
        
        // Handle post button click
        postBtn.addEventListener('click', function() {
            const text = composerTextarea.value.trim();
            if (text) {
                const posterName = 'Teacher Name'; // Replace with actual teacher name
                const posterPic = 'https://i.pravatar.cc/40'; // Placeholder image
                const postTime = new Date().toLocaleString();

                const newAnnouncementHTML = `
                    <div class="announcement-card">
                        <div class="announcement-header">
                            <img src="${posterPic}" alt="Profile" class="profile-pic">
                            <div class="poster-info">
                                <span class="poster-name">${posterName}</span>
                                <span class="post-time">${postTime}</span>
                            </div>
                            <div class="announcement-actions">
                                <button class="edit-btn">Edit</button>
                                <button class="delete-btn">Delete</button>
                            </div>
                        </div>
                        <div class="announcement-content">
                            <p>${text}</p>
                        </div>
                        <div class="announcement-footer">
                            <button class="comment-btn">Add class comment</button>
                        </div>
                        <div class="comments-section">
                            <div class="comments-list"></div>
                            <div class="comment-input">
                                <textarea placeholder="Add a comment..."></textarea>
                                <button class="post-comment-btn">Post</button>
                            </div>
                        </div>
                    </div>
                `;

                const feed = document.querySelector('.announcements-feed');
                if (feed) {
                    feed.insertAdjacentHTML('afterbegin', newAnnouncementHTML);
                    composerTextarea.value = '';
                    postBtn.disabled = true;
                }
            }
        });
    }

    // Legacy announcement posting (keeping for compatibility)
    const legacyPostBtn = document.querySelector('.announcement-composer .btn');
    if (legacyPostBtn) {
        legacyPostBtn.addEventListener('click', function() {
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
                const announcements = document.querySelector('#announcements');
                if (announcements) {
                    announcements.insertBefore(announcement, document.querySelector('.announcement-composer').nextSibling);
                    textarea.value = '';
                    alert('Announcement posted!');
                }
            } else {
                alert('Please enter an announcement.');
            }
        });
    }
});

// Enhanced comment functionality with event delegation
document.addEventListener('DOMContentLoaded', function() {
    const announcementsFeed = document.querySelector('.announcements-feed');
    if (announcementsFeed) {
        announcementsFeed.addEventListener('click', function(e) {
            // Handle comment button click
            if (e.target.classList.contains('comment-btn')) {
                const commentInput = e.target.closest('.announcement-card').querySelector('.comment-input');
                if (commentInput) {
                    commentInput.style.display = 'block';
                    commentInput.querySelector('textarea').focus();
                }
            }
            
            // Handle post comment button click
            else if (e.target.classList.contains('post-comment-btn')) {
                const textarea = e.target.previousElementSibling;
                const commentText = textarea.value.trim();
                if (commentText) {
                    const commentHTML = `
                        <div class="comment">
                            <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
                            <div class="comment-info">
                                <span class="commenter-name">Teacher Name</span>
                                <p>${commentText}</p>
                                <span class="comment-time">${new Date().toLocaleString()}</span>
                            </div>
                        </div>
                    `;
                    const commentsList = e.target.closest('.comments-section').querySelector('.comments-list');
                    commentsList.insertAdjacentHTML('beforeend', commentHTML);
                    textarea.value = '';
                }
            }
            
            // Handle edit button click
            else if (e.target.classList.contains('edit-btn')) {
                const card = e.target.closest('.announcement-card');
                const content = card.querySelector('.announcement-content p');
                const currentText = content.textContent;
                
                const newText = prompt('Edit your announcement:', currentText);
                if (newText && newText.trim() !== '') {
                    content.textContent = newText;
                }
            }
            
            // Handle delete button click
            else if (e.target.classList.contains('delete-btn')) {
                if (confirm('Are you sure you want to delete this announcement?')) {
                    const card = e.target.closest('.announcement-card');
                    card.remove();
                }
            }
        });
    }
});

// Doubt response functionality (placeholder)
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.doubt .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const response = prompt('Enter your response:');
            if (response) {
                alert('Response sent to student: ' + response);
            }
        });
    });
});