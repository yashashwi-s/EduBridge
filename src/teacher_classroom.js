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
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
});

// Announcement posting functionality using API
document.addEventListener('DOMContentLoaded', function() {
    const composerTextarea = document.querySelector('.announcement-composer textarea');
    const postBtn = document.querySelector('.announcement-composer .post-btn');

    if (composerTextarea && postBtn) {
        composerTextarea.addEventListener('input', function() {
            postBtn.disabled = this.value.trim() === '';
        });
        
        postBtn.addEventListener('click', function() {
            const text = composerTextarea.value.trim();
            if (!text) return;
            
            // Retrieve JWT token from localStorage
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert('You are not authenticated. Please log in.');
                return;
            }
            
            fetch('/api/announcements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ text: text })
            })
            .then(response => response.json())
            .then(data => {
                if (data.announcement) {
                    // Build the announcement card using the returned data
                    const announcement = data.announcement;
                    const newAnnouncementHTML = `
                        <div class="announcement-card" data-id="${announcement._id}">
                            <div class="announcement-header">
                                <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
                                <div class="poster-info">
                                    <span class="poster-name">Your Name</span>
                                    <span class="post-time">${new Date(announcement.postTime).toLocaleString()}</span>
                                </div>
                                <div class="announcement-actions">
                                    <button class="edit-btn">Edit</button>
                                    <button class="delete-btn">Delete</button>
                                </div>
                            </div>
                            <div class="announcement-content">
                                <p>${announcement.text}</p>
                            </div>
                            <div class="announcement-footer">
                                <button class="comment-btn">Add class comment</button>
                            </div>
                            <div class="comments-section">
                                <div class="comments-list"></div>
                                <div class="comment-input" style="display:none;">
                                    <textarea placeholder="Add a comment..."></textarea>
                                    <button class="post-comment-btn">Post</button>
                                </div>
                            </div>
                        </div>
                    `;
                    const feed = document.querySelector('.announcements-feed');
                    if (feed) {
                        feed.insertAdjacentHTML('afterbegin', newAnnouncementHTML);
                    }
                    composerTextarea.value = '';
                    postBtn.disabled = true;
                } else {
                    alert('Failed to post announcement.');
                }
            })
            .catch(err => {
                console.error(err);
                alert('Error posting announcement.');
            });
        });
    }

    // Legacy announcement posting (if needed for compatibility)
    const legacyPostBtn = document.querySelector('.announcement-composer .btn');
    if (legacyPostBtn) {
        legacyPostBtn.addEventListener('click', function() {
            const textarea = document.querySelector('.announcement-composer textarea');
            const text = textarea.value.trim();
            if (text) {
                alert('Please use the updated posting feature.');
            } else {
                alert('Please enter an announcement.');
            }
        });
    }
});

// Enhanced comment, edit, and delete functionality (using event delegation)
document.addEventListener('DOMContentLoaded', function() {
    const announcementsFeed = document.querySelector('.announcements-feed');
    if (announcementsFeed) {
        announcementsFeed.addEventListener('click', function(e) {
            // Handle comment button click to show input area
            if (e.target.classList.contains('comment-btn')) {
                const commentInput = e.target.closest('.announcement-card').querySelector('.comment-input');
                if (commentInput) {
                    commentInput.style.display = 'block';
                    commentInput.querySelector('textarea').focus();
                }
            }
            // Handle post comment button click to send comment to API
            else if (e.target.classList.contains('post-comment-btn')) {
                const card = e.target.closest('.announcement-card');
                const announcementId = card.getAttribute('data-id');
                const textarea = e.target.previousElementSibling;
                const commentText = textarea.value.trim();
                if (!commentText) return;

                const token = localStorage.getItem('access_token');
                if (!token) {
                    alert('Authentication error.');
                    return;
                }
                fetch(`/api/announcements/${announcementId}/comments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ text: commentText })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.comment) {
                        const commentHTML = `
                            <div class="comment">
                                <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
                                <div class="comment-info">
                                    <span class="commenter-name">Your Name</span>
                                    <p>${data.comment.text}</p>
                                    <span class="comment-time">${new Date(data.comment.commentTime).toLocaleString()}</span>
                                </div>
                            </div>
                        `;
                        const commentsList = card.querySelector('.comments-list');
                        commentsList.insertAdjacentHTML('beforeend', commentHTML);
                        textarea.value = '';
                    }
                })
                .catch(err => console.error(err));
            }
            // Handle edit button click (for simplicity, using prompt and then API call)
            else if (e.target.classList.contains('edit-btn')) {
                const card = e.target.closest('.announcement-card');
                const announcementId = card.getAttribute('data-id');
                const contentElem = card.querySelector('.announcement-content p');
                const currentText = contentElem.textContent;
                const newText = prompt('Edit your announcement:', currentText);
                if (newText && newText.trim() !== '') {
                    const token = localStorage.getItem('access_token');
                    fetch(`/api/announcements/${announcementId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({ text: newText })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.msg === 'Announcement updated') {
                            contentElem.textContent = newText;
                        }
                    });
                }
            }
            // Handle delete button click
            else if (e.target.classList.contains('delete-btn')) {
                if (confirm('Are you sure you want to delete this announcement?')) {
                    const card = e.target.closest('.announcement-card');
                    const announcementId = card.getAttribute('data-id');
                    const token = localStorage.getItem('access_token');
                    fetch(`/api/announcements/${announcementId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.msg === 'Announcement deleted') {
                            card.remove();
                        }
                    });
                }
            }
        });
    }
});

// Doubt response functionality (placeholder remains unchanged)
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
