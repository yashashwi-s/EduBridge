document.getElementById('hamburger').addEventListener('click', function () {
    document.querySelector('.sidebar').classList.toggle('expanded');
});

document.querySelector('.profile-icon').addEventListener('click', function () {
    document.querySelector('.profile-dropdown').classList.toggle('show');
});

document.addEventListener('click', function (event) {
    if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
        document.querySelector('.profile-dropdown').classList.remove('show');
    }
    
    if (event.target.classList.contains('schedule-modal') || event.target.classList.contains('drafts-modal')) {
        const modal = event.target;
        modal.classList.remove('active');
        modal.querySelector('.modal-content, .schedule-modal-content, .drafts-modal-content').style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
});

// Utility function to check JWT token validity
function checkJwtToken() {
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No JWT token found in localStorage');
        return {
            exists: false,
            valid: false,
            message: 'No token found'
        };
    }
    
    // Check token format
    const segments = token.split('.');
    if (segments.length !== 3) {
        console.error('Invalid JWT token format:', token);
        return {
            exists: true,
            valid: false,
            message: 'Invalid token format (not 3 segments)'
        };
    }
    
    // Try to decode the payload (middle segment)
    try {
        const base64Url = segments[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        
        // Check expiration
        if (payload.exp) {
            const expirationTime = payload.exp * 1000; // Convert to milliseconds
            const currentTime = Date.now();
            
            if (currentTime > expirationTime) {
                console.error('JWT token has expired');
                return {
                    exists: true,
                    valid: false,
                    message: 'Token expired',
                    payload: payload
                };
            }
        }
        
        return {
            exists: true,
            valid: true,
            message: 'Token is valid',
            payload: payload
        };
    } catch (error) {
        console.error('Error decoding JWT token:', error);
        return {
            exists: true,
            valid: false,
            message: 'Error decoding token: ' + error.message
        };
    }
}

document.addEventListener('DOMContentLoaded', function () {
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
    
    // Debug token
    const tokenStatus = checkJwtToken();
    console.log('JWT Token status:', tokenStatus);
    
    if (!tokenStatus.valid) {
        const errorMessage = 'Authentication error: ' + tokenStatus.message;
        console.error(errorMessage);
        showNotification(errorMessage, 'error');
        
        // Redirect to login after a short delay
        if (!tokenStatus.exists) {
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        }
    }
});

const urlParams = new URLSearchParams(window.location.search);
const classroomId = urlParams.get('classroomId');
if (!classroomId) {
    alert('Classroom ID not provided in URL');
}

let teacherNameGlobal = "";
let teacherAvatarGlobal = "images/image.png";
let announcementAttachments = [];
let announcementImages = [];
let draftAnnouncements = {};

// Quiz Management
let quizzes = [];
let nextQuestionId = 2; // Start with 2 since we have one question by default
let currentEditingQuizId = null;

document.addEventListener('DOMContentLoaded', function () {
    const markdownScript = document.createElement('script');
    markdownScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js';
    document.head.appendChild(markdownScript);
    
    // Add MathJax for LaTeX rendering
    const mathjaxScript = document.createElement('script');
    mathjaxScript.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    mathjaxScript.async = true;
    document.head.appendChild(mathjaxScript);
    
    // Configure MathJax
    window.MathJax = {
        tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']]
        },
        svg: {
            fontCache: 'global'
        }
    };
    
    initializeComposer();
    loadDrafts();
    
    // Initialize quiz functionality if the quiz tab exists
    if (document.getElementById('quizzes')) {
        initializeQuizzes();
    }
});

function initializeComposer() {
    const composerContainer = document.querySelector('.announcement-composer');
    if (!composerContainer) return;
    composerContainer.innerHTML = `
      <div class="composer-header">
        <img src="${teacherAvatarGlobal}" alt="Your Avatar" class="profile-pic">
        <div class="composer-info">
          <span class="composer-name">You are posting as: <span id="teacher-name">Teacher</span></span>
        </div>
      </div>
      <div class="composer-body">
        <div class="composer-tabs">
          <button class="composer-tab active" data-mode="write">Write</button>
          <button class="composer-tab" data-mode="preview">Preview</button>
        </div>
        <div class="composer-content">
          <div class="write-mode active">
            <textarea placeholder="Share something with your class..." rows="4"></textarea>
          </div>
          <div class="preview-mode markdown-preview"></div>
        </div>
      </div>
      <div class="attachment-preview-area">
        <div class="images-preview"></div>
        <div class="files-preview"></div>
      </div>
      <div class="composer-footer">
        <div class="composer-actions">
          <button class="action-btn attach-btn" title="Add attachment">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          <button class="action-btn image-btn" title="Add image">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>
          </button>
          <button class="action-btn schedule-btn" title="Schedule post">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </button>
          <button class="action-btn save-draft-btn" title="Save as draft">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          </button>
        </div>
        <div class="composer-submit">
          <span class="markdown-tip">Supports Markdown formatting</span>
          <button class="post-btn" disabled>Post</button>
        </div>
      </div>
      <input type="file" id="attachment-file-input" style="display: none;">
      <input type="file" id="image-file-input" accept="image/*" style="display: none;">
      <div class="schedule-modal" style="display: none;">
        <div class="schedule-modal-content">
          <h3>Schedule Post</h3>
          <div class="schedule-form">
            <label>
              Date:
              <input type="date" id="schedule-date">
            </label>
            <label>
              Time:
              <input type="time" id="schedule-time">
            </label>
          </div>
          <div class="schedule-actions">
            <button class="cancel-schedule-btn">Cancel</button>
            <button class="confirm-schedule-btn">Schedule</button>
          </div>
        </div>
      </div>
      <div class="drafts-modal" style="display: none;">
        <div class="drafts-modal-content">
          <h3>Saved Drafts</h3>
          <div class="drafts-list"></div>
          <div class="drafts-actions">
            <button class="close-drafts-btn">Close</button>
          </div>
        </div>
      </div>
    `;
    setupComposerListeners();
}

function setupComposerListeners() {
    document.querySelectorAll('.composer-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const mode = this.getAttribute('data-mode');
            document.querySelectorAll('.composer-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.write-mode').classList.remove('active');
            document.querySelector('.preview-mode').classList.remove('active');
            this.classList.add('active');
            document.querySelector(`.${mode}-mode`).classList.add('active');
            if (mode === 'preview') {
                updateMarkdownPreview();
            }
        });
    });
    const composerTextarea = document.querySelector('.announcement-composer textarea');
    const postBtn = document.querySelector('.announcement-composer .post-btn');
    if (composerTextarea && postBtn) {
        composerTextarea.addEventListener('input', function () {
            postBtn.disabled = this.value.trim() === '';
            if (this.value.trim() !== '') {
                autosaveDraft(this.value);
            }
        });
        composerTextarea.addEventListener('keyup', function () {
            if (document.querySelector('.preview-mode').classList.contains('active')) {
                updateMarkdownPreview();
            }
        });
    }
    const attachBtn = document.querySelector('.announcement-composer .attach-btn');
    const attachmentInput = document.getElementById('attachment-file-input');
    if (attachBtn && attachmentInput) {
        attachBtn.addEventListener('click', function () {
            attachmentInput.click();
        });
        attachmentInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                const file = this.files[0];
                const fileObj = {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    url: URL.createObjectURL(file)
                };
                announcementAttachments.push(fileObj);
                renderAttachmentPreviews();
            }
        });
    }
    const imageBtn = document.querySelector('.announcement-composer .image-btn');
    const imageInput = document.getElementById('image-file-input');
    if (imageBtn && imageInput) {
        imageBtn.addEventListener('click', function () {
            imageInput.click();
        });
        imageInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                Array.from(this.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const imgObj = {
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            url: URL.createObjectURL(file)
                        };
                        announcementImages.push(imgObj);
                        renderImagePreviews();
                    }
                });
            }
        });
    }
    const scheduleBtn = document.querySelector('.schedule-btn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', function () {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            document.getElementById('schedule-date').valueAsDate = tomorrow;
            document.getElementById('schedule-time').value = new Date().toTimeString().slice(0, 5);
            const modal = document.querySelector('.schedule-modal');
            modal.style.display = 'flex';
            // Add active class after a small delay for animation
            setTimeout(() => {
                modal.classList.add('active');
                modal.querySelector('.schedule-modal-content').style.opacity = '1';
            }, 10);
        });
    }
    document.querySelector('.cancel-schedule-btn')?.addEventListener('click', function () {
        const modal = document.querySelector('.schedule-modal');
        modal.classList.remove('active');
        modal.querySelector('.schedule-modal-content').style.opacity = '0';
        // Hide the modal after animation completes
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    });
    document.querySelector('.confirm-schedule-btn')?.addEventListener('click', function () {
        const scheduledDate = document.getElementById('schedule-date').value;
        const scheduledTime = document.getElementById('schedule-time').value;
        if (scheduledDate && scheduledTime) {
            const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
            document.querySelector('.post-btn').textContent = 'Schedule';
            document.querySelector('.post-btn').setAttribute('data-scheduled', scheduledDateTime.toISOString());
            document.querySelector('.schedule-modal').style.display = 'none';
            const scheduleIndicator = document.createElement('div');
            scheduleIndicator.className = 'schedule-indicator';
            scheduleIndicator.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Scheduled for ${scheduledDateTime.toLocaleString()}
        `;
            const existingIndicator = document.querySelector('.schedule-indicator');
            if (existingIndicator) existingIndicator.remove();
            document.querySelector('.composer-footer').prepend(scheduleIndicator);
        }
    });
    document.querySelector('.save-draft-btn')?.addEventListener('click', function () {
        saveDraft();
    });
    if (postBtn) {
        postBtn.addEventListener('click', function () {
            const text = composerTextarea.value.trim();
            if (!text) return;
            
            // Show loading state
            const originalText = this.textContent;
            this.disabled = true;
            this.innerHTML = '<span class="spinner"></span> Posting...';
            
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert('You are not authenticated. Please log in.');
                return;
            }
            
            const editId = this.getAttribute('data-edit-id');
            const scheduledTime = this.getAttribute('data-scheduled');
            const formattedAttachments = announcementAttachments.map(att => ({
                name: att.name,
                url: att.url
            }));
            const formattedImages = announcementImages.map(img => ({
                url: img.url
            }));
            
            if (editId) {
                // This is an update to an existing announcement
                fetch(`/api/classrooms/${classroomId}/announcements/${editId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        text: text
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to update announcement');
                    }
                    return response.json();
                })
                .then(data => {
                    clearDraft();
                    // Update the content in the DOM
                    const announcementCard = document.querySelector(`.announcement-card[data-id="${editId}"]`);
                    if (announcementCard) {
                        let updatedText = text;
                        if (typeof marked !== 'undefined') {
                            updatedText = marked.parse(text);
                        }
                        announcementCard.querySelector('.markdown-content').innerHTML = updatedText;
                        
                        // Highlight the updated announcement briefly
                        announcementCard.classList.add('highlight-update');
                        setTimeout(() => {
                            announcementCard.classList.remove('highlight-update');
                        }, 2000);
                        
                        // Render LaTeX if MathJax is available
                        if (window.MathJax) {
                            window.MathJax.typeset([announcementCard.querySelector('.markdown-content')]);
                        }
                    }
                    
                    // Reset the composer
                    composerTextarea.value = '';
                    this.disabled = true;
                    this.textContent = originalText;
                    this.removeAttribute('data-edit-id');
                    announcementAttachments = [];
                    announcementImages = [];
                    document.querySelector('.images-preview').innerHTML = '';
                    document.querySelector('.files-preview').innerHTML = '';
                    
                    // Show success notification
                    showNotification('Announcement updated successfully!', 'success');
                })
                .catch(err => {
                    console.error(err);
                    this.disabled = false;
                    this.textContent = originalText;
                    showNotification('Error updating announcement: ' + err.message, 'error');
                });
            } else {
                // This is a new announcement
                fetch(`/api/classrooms/${classroomId}/announcements`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        text: text,
                        attachments: formattedAttachments,
                        images: formattedImages,
                        scheduledTime: scheduledTime || null
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.announcement) {
                        clearDraft();
                        renderNewAnnouncement(data.announcement);
                        composerTextarea.value = '';
                        this.disabled = true;
                        this.textContent = originalText;
                        announcementAttachments = [];
                        announcementImages = [];
                        document.querySelector('.images-preview').innerHTML = '';
                        document.querySelector('.files-preview').innerHTML = '';
                        this.textContent = 'Post';
                        this.removeAttribute('data-scheduled');
                        const scheduleIndicator = document.querySelector('.schedule-indicator');
                        if (scheduleIndicator) scheduleIndicator.remove();
                        
                        // Show success notification
                        if (scheduledTime) {
                            showNotification('Announcement scheduled successfully!', 'success');
                        } else {
                            showNotification('Announcement posted successfully!', 'success');
                        }
                    } else {
                        this.disabled = false;
                        this.textContent = originalText;
                        showNotification('Failed to post announcement.', 'error');
                    }
                })
                .catch(err => {
                    console.error(err);
                    this.disabled = false;
                    this.textContent = originalText;
                    showNotification('Error posting announcement.', 'error');
                });
            }
        });
    }
}

function updateMarkdownPreview() {
    const text = document.querySelector('.announcement-composer textarea').value;
    const previewElement = document.querySelector('.markdown-preview');
    if (typeof marked !== 'undefined') {
        previewElement.innerHTML = marked.parse(text);
        
        // Render LaTeX in the preview if MathJax is available
        if (window.MathJax) {
            window.MathJax.typeset([previewElement]);
        }
    } else {
        previewElement.textContent = text;
    }
}

function renderAttachmentPreviews() {
    const previewContainer = document.querySelector('.files-preview');
    previewContainer.innerHTML = '';
    announcementAttachments.forEach((attachment, index) => {
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        let fileIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      `;
        if (attachment.type.includes('pdf')) {
            fileIcon = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15v-4h6"></path><path d="M9 13h5"></path></svg>
        `;
        }
        fileCard.innerHTML = `
        <div class="file-icon">${fileIcon}</div>
        <div class="file-info">
          <div class="file-name">${attachment.name}</div>
          <div class="file-size">${formatFileSize(attachment.size)}</div>
        </div>
        <button class="remove-file-btn" data-index="${index}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="6"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
        previewContainer.appendChild(fileCard);
    });
    document.querySelectorAll('.remove-file-btn').forEach(button => {
        button.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            announcementAttachments.splice(index, 1);
            renderAttachmentPreviews();
        });
    });
}

function renderImagePreviews() {
    const previewContainer = document.querySelector('.images-preview');
    previewContainer.innerHTML = '';
    announcementImages.forEach((image, index) => {
        const imgCard = document.createElement('div');
        imgCard.className = 'image-card';
        imgCard.innerHTML = `
        <div class="image-preview-container">
          <img src="${image.url}" alt="Image preview">
        </div>
        <div class="image-actions">
          <span class="image-name">${image.name.length > 15 ? image.name.substring(0, 12) + '...' : image.name}</span>
          <button class="remove-image-btn" data-index="${index}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
        previewContainer.appendChild(imgCard);
    });
    document.querySelectorAll('.remove-image-btn').forEach(button => {
        button.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            announcementImages.splice(index, 1);
            renderImagePreviews();
        });
    });
}

function renderNewAnnouncement(announcement) {
    const feed = document.querySelector('.announcements-feed');
    let announcementText = announcement.text;
    if (typeof marked !== 'undefined') {
        announcementText = marked.parse(announcement.text);
    }
    
    // Store image data in the announcement object to persist through page reloads
    if (announcementImages.length > 0) {
        announcement.images = announcementImages.map(img => {
            return {
                url: img.src,
                name: img.name || 'image'
            };
        });
        
        // Save images to database
        fetch(`/api/classrooms/${classroomId}/announcements/${announcement.announcement_id}/images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('access_token')
            },
            body: JSON.stringify({ images: announcement.images })
        }).catch(err => console.error('Error saving images:', err));
    }
    
    const attHtml = announcement.attachments && announcement.attachments.length ? `<div class="attachments">
        ${announcement.attachments.map(att => `<a href="${att.url}" target="_blank" class="attachment-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${att.name}
        </a>`).join(' ')}
    </div>` : '';
    
    const imgHtml = announcement.images && announcement.images.length ? `<div class="images">
        ${announcement.images.map(img => `<a href="${img.url}" target="_blank" class="image-link">
            <img src="${img.url}" alt="${img.name || 'Image'}" class="announcement-image">
        </a>`).join(' ')}
    </div>` : '';
    
    const annHtml = `<div class="announcement-card" data-id="${announcement.announcement_id}">
        <div class="announcement-header">
            <img src="${teacherAvatarGlobal}" alt="Teacher" class="profile-pic">
            <div class="poster-info">
                <span class="poster-name">${teacherNameGlobal}</span>
                <span class="post-time">${new Date(announcement.postTime || Date.now()).toLocaleString()}</span>
            </div>
            <div class="announcement-actions">
                <button class="edit-btn" data-id="${announcement.announcement_id}"></button>
                <button class="delete-btn" data-id="${announcement.announcement_id}"></button>
            </div>
        </div>
        <div class="announcement-content">
            <div class="markdown-content">${announcementText}</div>
            ${attHtml}
            ${imgHtml}
        </div>
        <div class="announcement-footer">
            <button class="comment-btn">
                ${announcement.comments && announcement.comments.length ? `
                Comments (${announcement.comments.length})
                ` : 'Add class comment'}
            </button>
        </div>
        <div class="comments-section">
            <div class="comments-list">
                ${announcement.comments && announcement.comments.map(comment => {
                    // Parse comment text with Markdown if available
                    let commentText = comment.text;
                    if (typeof marked !== 'undefined') {
                        commentText = marked.parse(commentText);
                    }
                    
                    return `
                    <div class="comment">
                        <img src="images/image.png" alt="Profile" class="profile-pic">
                        <div class="comment-info">
                            <span class="commenter-name">${comment.commenterName}</span>
                            <p>${commentText}</p>
                            <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
                        </div>
                    </div>
                    `;
                }).join('') || ''}
            </div>
            <div class="comment-input">
                <textarea placeholder="Add a class comment..."></textarea>
                <button class="post-comment-btn">Post</button>
            </div>
        </div>
    </div>`;
    
    feed.insertAdjacentHTML('afterbegin', annHtml);
    
    // Render LaTeX if MathJax is available
    if (window.MathJax) {
        const newCard = feed.firstElementChild;
        window.MathJax.typeset([newCard.querySelector('.markdown-content')]);
    }
}

function renderExistingAnnouncement(ann) {
    const feed = document.querySelector('.announcements-feed');
    let announcementText = ann.text;
    if (typeof marked !== 'undefined') {
        announcementText = marked.parse(ann.text);
    }
    
    const attHtml = ann.attachments && ann.attachments.length ? `<div class="attachments">
        ${ann.attachments.map(att => `<a href="${att.url}" target="_blank" class="attachment-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${att.name}
        </a>`).join(' ')}
    </div>` : '';
    
    // Ensure ann.images exists and has expected format
    const imgHtml = ann.images && ann.images.length ? `<div class="images">
        ${ann.images.map(img => `<a href="${img.url || img}" target="_blank" class="image-link">
            <img src="${img.url || img}" alt="${img.name || 'Image'}" class="announcement-image">
        </a>`).join(' ')}
    </div>` : '';
    
    const annHtml = `<div class="announcement-card" data-id="${ann.announcement_id}">
        <div class="announcement-header">
            <img src="${teacherAvatarGlobal}" alt="Teacher" class="profile-pic">
            <div class="poster-info">
                <span class="poster-name">${teacherNameGlobal}</span>
                <span class="post-time">${new Date(ann.postTime).toLocaleString()}</span>
            </div>
            <div class="announcement-actions">
                <button class="edit-btn" data-id="${ann.announcement_id}"></button>
                <button class="delete-btn" data-id="${ann.announcement_id}"></button>
            </div>
        </div>
        <div class="announcement-content">
            <div class="markdown-content">${announcementText}</div>
            ${attHtml}
            ${imgHtml}
        </div>
        <div class="announcement-footer">
            <button class="comment-btn">
                ${ann.comments && ann.comments.length ? `
                Comments (${ann.comments.length})
                ` : 'Add class comment'}
            </button>
        </div>
        <div class="comments-section">
            <div class="comments-list">
                ${ann.comments && ann.comments.map(comment => {
                    // Parse comment text with Markdown if available
                    let commentText = comment.text;
                    if (typeof marked !== 'undefined') {
                        commentText = marked.parse(commentText);
                    }
                    
                    return `
                    <div class="comment">
                        <img src="images/image.png" alt="Profile" class="profile-pic">
                        <div class="comment-info">
                            <span class="commenter-name">${comment.commenterName}</span>
                            <p>${commentText}</p>
                            <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
                        </div>
                    </div>
                    `;
                }).join('') || ''}
            </div>
            <div class="comment-input">
                <textarea placeholder="Add a class comment..."></textarea>
                <button class="post-comment-btn">Post</button>
            </div>
        </div>
    </div>`;
    
    feed.insertAdjacentHTML('beforeend', annHtml);
    
    // Render LaTeX if MathJax is available
    if (window.MathJax) {
        const markdownContent = feed.lastElementChild.querySelector('.markdown-content');
        window.MathJax.typeset([markdownContent]);
    }
}

function loadClassroomData() {
    const token = localStorage.getItem('access_token');
    if (!token) {
        alert('You are not authenticated. Please log in.');
        return;
    }
    fetch(`/api/classrooms/${classroomId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(resp => resp.json())
        .then(data => {
            teacherNameGlobal = data.teacherName || "Teacher Name";
            
            // Update classroom header
            const header = document.querySelector('.classroom-header');
            document.querySelector('.classroom-header h1').textContent = data.className || "Course Name";
            document.querySelector('.classroom-header p').textContent = `${data.section || "Section"} - ${data.subject || "Subject"}`;
            
            // Set classroom background image from the database
            if (data.classImage) {
                // Try to use the image URL from the database
                const img = new Image();
                img.onload = function() {
                    // Image loaded successfully, use it
                    header.style.backgroundImage = `url('${data.classImage}')`;
                };
                img.onerror = function() {
                    // Image failed to load, use subject-based fallback
                    useSubjectBasedImage(data.subject, header);
                };
                img.src = data.classImage;
            } else {
                // No image in database, use subject-based fallback
                useSubjectBasedImage(data.subject, header);
            }
            
            document.getElementById('teacher-name').textContent = teacherNameGlobal;
            const feed = document.querySelector('.announcements-feed');
            
            // Add controls for search and sort
            const controlsHTML = `
              <div class="announcements-controls">
                <div class="search-container">
                  <input type="text" id="announcement-search" placeholder="Search announcements...">
                  <button id="search-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  </button>
                </div>
                <div class="sort-container">
                  <label for="sort-announcements">Sort by:</label>
                  <select id="sort-announcements">
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="comments">Most commented</option>
                  </select>
                </div>
              </div>
            `;
            
            // Add controls before the feed content
            if (!document.querySelector('.announcements-controls')) {
              feed.insertAdjacentHTML('beforebegin', controlsHTML);
              
              // Set up event listeners for search and sort
              document.getElementById('announcement-search').addEventListener('input', filterAnnouncements);
              document.getElementById('search-btn').addEventListener('click', filterAnnouncements);
              document.getElementById('sort-announcements').addEventListener('change', sortAnnouncements);
            }
            
            // Store announcements in a global variable for sorting/filtering
            window.allAnnouncements = data.announcements || [];
            
            // Sort announcements by default (newest first)
            sortAnnouncementsByDate('newest');
        })
        .catch(err => console.error(err));
}

// Function to sort announcements by date
function sortAnnouncementsByDate(order = 'newest') {
    if (!window.allAnnouncements) return;
    
    const feed = document.querySelector('.announcements-feed');
    feed.innerHTML = '';
    
    // Sort the announcements array
    const sortedAnnouncements = [...window.allAnnouncements];
    
    if (order === 'newest') {
        sortedAnnouncements.sort((a, b) => new Date(b.postTime) - new Date(a.postTime));
    } else if (order === 'oldest') {
        sortedAnnouncements.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    } else if (order === 'comments') {
        sortedAnnouncements.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    }
    
    // Render the sorted announcements
    sortedAnnouncements.forEach(ann => {
        renderExistingAnnouncement(ann);
    });
    
    // Render LaTeX in all announcements if MathJax is available
    if (window.MathJax) {
        const markdownElements = document.querySelectorAll('.markdown-content');
        if (markdownElements.length > 0) {
            window.MathJax.typeset(Array.from(markdownElements));
        }
    }
}

// Function to filter announcements by search term
function filterAnnouncements() {
    if (!window.allAnnouncements) return;
    
    const searchTerm = document.getElementById('announcement-search').value.toLowerCase().trim();
    const sortOrder = document.getElementById('sort-announcements').value;
    const feed = document.querySelector('.announcements-feed');
    feed.innerHTML = '';
    
    if (!searchTerm) {
        // If no search term, just sort and display all
        sortAnnouncementsByDate(sortOrder);
        return;
    }
    
    // Filter and sort the announcements
    const filteredAnnouncements = window.allAnnouncements.filter(ann => {
        const announcementText = ann.text.toLowerCase();
        const hasMatchingComments = ann.comments && ann.comments.some(comment => 
            comment.text.toLowerCase().includes(searchTerm) || 
            comment.commenterName.toLowerCase().includes(searchTerm)
        );
        
        return announcementText.includes(searchTerm) || hasMatchingComments;
    });
    
    // Apply sorting to filtered results
    if (sortOrder === 'newest') {
        filteredAnnouncements.sort((a, b) => new Date(b.postTime) - new Date(a.postTime));
    } else if (sortOrder === 'oldest') {
        filteredAnnouncements.sort((a, b) => new Date(a.postTime) - new Date(b.postTime));
    } else if (sortOrder === 'comments') {
        filteredAnnouncements.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    }
    
    if (filteredAnnouncements.length === 0) {
        feed.innerHTML = '<div class="no-results">No announcements match your search</div>';
        return;
    }
    
    // Render the filtered and sorted announcements
    filteredAnnouncements.forEach(ann => {
        renderExistingAnnouncement(ann);
    });
    
    // Highlight search terms in the rendered announcements
    if (searchTerm) {
        highlightSearchTerms(searchTerm);
    }
    
    // Render LaTeX in filtered announcements
    if (window.MathJax) {
        const markdownElements = document.querySelectorAll('.markdown-content');
        if (markdownElements.length > 0) {
            window.MathJax.typeset(Array.from(markdownElements));
        }
    }
}

// Function to highlight search terms in the rendered announcements
function highlightSearchTerms(searchTerm) {
    const contentElements = document.querySelectorAll('.markdown-content, .comment p');
    
    contentElements.forEach(element => {
        const originalHTML = element.innerHTML;
        // Create a regex that matches the search term with case-insensitivity
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        // Replace matches with highlighted version
        const highlightedHTML = originalHTML.replace(regex, '<span class="search-highlight">$1</span>');
        element.innerHTML = highlightedHTML;
    });
}

// Function to handle sorting announcement changes
function sortAnnouncements() {
    const sortOrder = document.getElementById('sort-announcements').value;
    const searchTerm = document.getElementById('announcement-search').value.trim();
    
    if (searchTerm) {
        // If there's a search term, refilter with the new sort order
        filterAnnouncements();
    } else {
        // Otherwise just sort all announcements
        sortAnnouncementsByDate(sortOrder);
    }
}

function saveDraft() {
    const text = document.querySelector('.announcement-composer textarea').value.trim();
    if (!text) return;
    const draftId = 'draft_' + Date.now();
    const draft = {
        id: draftId,
        text: text,
        attachments: announcementAttachments,
        images: announcementImages,
        timestamp: new Date().toISOString()
    };
    draftAnnouncements[draftId] = draft;
    
    // Save locally
    localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
    
    // Save to server if authenticated
    const token = localStorage.getItem('access_token');
    if (token) {
        fetch(`/api/classrooms/${classroomId}/drafts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                draft_id: draftId,
                text: text,
                attachments: draft.attachments,
                images: draft.images,
                timestamp: draft.timestamp
            })
        })
        .then(response => {
            if (!response.ok) {
                console.warn('Failed to save draft to server, but it was saved locally');
            }
        })
        .catch(err => {
            console.error('Error saving draft to server:', err);
        });
    }
    
    alert('Draft saved successfully!');
}

function autosaveDraft(text) {
    const autosaveDraftId = 'autosave_draft';
    const draft = {
        id: autosaveDraftId,
        text: text,
        attachments: announcementAttachments,
        images: announcementImages,
        timestamp: new Date().toISOString()
    };
    draftAnnouncements[autosaveDraftId] = draft;
    localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
    
    // Autosave to server if authenticated
    const token = localStorage.getItem('access_token');
    if (token) {
        fetch(`/api/classrooms/${classroomId}/drafts/autosave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                text: text,
                attachments: draft.attachments,
                images: draft.images,
                timestamp: draft.timestamp
            })
        }).catch(err => {
            console.error('Error autosaving draft to server:', err);
        });
    }
}

function loadDrafts() {
    // Load from localStorage first
    const savedDrafts = localStorage.getItem('announcement_drafts');
    if (savedDrafts) {
        draftAnnouncements = JSON.parse(savedDrafts);
    }
    
    // Then try to load from server
    const token = localStorage.getItem('access_token');
    if (token) {
        fetch(`/api/classrooms/${classroomId}/drafts`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Failed to load drafts from server');
        })
        .then(data => {
            // Merge server drafts with local drafts, preferring server versions
            if (data.drafts && data.drafts.length > 0) {
                data.drafts.forEach(draft => {
                    draftAnnouncements[draft.id] = draft;
                });
                localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
            }
            
            // Load the autosave draft if it exists
            if (draftAnnouncements['autosave_draft']) {
                const draft = draftAnnouncements['autosave_draft'];
                document.querySelector('.announcement-composer textarea').value = draft.text;
                if (draft.attachments && draft.attachments.length) {
                    announcementAttachments = draft.attachments;
                    renderAttachmentPreviews();
                }
                if (draft.images && draft.images.length) {
                    announcementImages = draft.images;
                    renderImagePreviews();
                }
                if (draft.text.trim() !== '') {
                    document.querySelector('.post-btn').disabled = false;
                }
            }
        })
        .catch(err => {
            console.error('Error loading drafts from server:', err);
            
            // Fall back to local drafts only
            if (draftAnnouncements['autosave_draft']) {
                const draft = draftAnnouncements['autosave_draft'];
                document.querySelector('.announcement-composer textarea').value = draft.text;
                if (draft.attachments && draft.attachments.length) {
                    announcementAttachments = draft.attachments;
                    renderAttachmentPreviews();
                }
                if (draft.images && draft.images.length) {
                    announcementImages = draft.images;
                    renderImagePreviews();
                }
                if (draft.text.trim() !== '') {
                    document.querySelector('.post-btn').disabled = false;
                }
            }
        });
    } else {
        // No token, just use local drafts
        if (draftAnnouncements['autosave_draft']) {
            const draft = draftAnnouncements['autosave_draft'];
            document.querySelector('.announcement-composer textarea').value = draft.text;
            if (draft.attachments && draft.attachments.length) {
                announcementAttachments = draft.attachments;
                renderAttachmentPreviews();
            }
            if (draft.images && draft.images.length) {
                announcementImages = draft.images;
                renderImagePreviews();
            }
            if (draft.text.trim() !== '') {
                document.querySelector('.post-btn').disabled = false;
            }
        }
    }
}

function loadDraftsList() {
    const draftsContainer = document.querySelector('.drafts-list');
    draftsContainer.innerHTML = '';
    const regularDrafts = Object.values(draftAnnouncements).filter(draft => draft.id !== 'autosave_draft');
    if (regularDrafts.length === 0) {
        draftsContainer.innerHTML = '<p class="no-drafts">No saved drafts found.</p>';
        return;
    }
    regularDrafts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    regularDrafts.forEach(draft => {
        const draftCard = document.createElement('div');
        draftCard.className = 'draft-card';
        const truncatedText = draft.text.length > 100 ?
            draft.text.substring(0, 100) + '...' :
            draft.text;
        draftCard.innerHTML = `
        <div class="draft-preview">
          <p>${truncatedText}</p>
          <span class="draft-date">${new Date(draft.timestamp).toLocaleString()}</span>
        </div>
        <div class="draft-actions">
          <button class="load-draft-btn" data-id="${draft.id}">Load</button>
          <button class="delete-draft-btn" data-id="${draft.id}">Delete</button>
        </div>
      `;
        draftsContainer.appendChild(draftCard);
    });
    document.querySelectorAll('.load-draft-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const draftId = this.getAttribute('data-id');
            loadDraftContent(draftId);
            const modal = document.querySelector('.drafts-modal');
            modal.style.display = 'none';
        });
    });
    document.querySelectorAll('.delete-draft-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const draftId = this.getAttribute('data-id');
            deleteDraft(draftId);
            loadDraftsList();
        });
    });
}

function loadDraftContent(draftId) {
    const draft = draftAnnouncements[draftId];
    if (!draft) return;
    document.querySelector('.announcement-composer textarea').value = draft.text;
    document.querySelector('.post-btn').disabled = false;
    announcementAttachments = [...(draft.attachments || [])];
    renderAttachmentPreviews();
    announcementImages = [...(draft.images || [])];
    renderImagePreviews();
}

function deleteDraft(draftId) {
    if (draftAnnouncements[draftId]) {
        delete draftAnnouncements[draftId];
        localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
        
        // Delete from server if authenticated
        const token = localStorage.getItem('access_token');
        if (token) {
            fetch(`/api/classrooms/${classroomId}/drafts/${draftId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .catch(err => {
                console.error('Error deleting draft from server:', err);
            });
        }
    }
}

function clearDraft() {
    if (draftAnnouncements['autosave_draft']) {
        delete draftAnnouncements['autosave_draft'];
        localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
        
        // Clear autosave draft on server if authenticated
        const token = localStorage.getItem('access_token');
        if (token) {
            fetch(`/api/classrooms/${classroomId}/drafts/autosave`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .catch(err => {
                console.error('Error clearing autosave draft from server:', err);
            });
        }
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

function setupDragAndDrop() {
    const composerDropZone = document.querySelector('.composer-body');
    if (!composerDropZone) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        composerDropZone.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    ['dragenter', 'dragover'].forEach(eventName => {
        composerDropZone.addEventListener(eventName, highlight, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        composerDropZone.addEventListener(eventName, unhighlight, false);
    });
    function highlight() {
        composerDropZone.classList.add('highlight-drop');
    }
    function unhighlight() {
        composerDropZone.classList.remove('highlight-drop');
    }
    composerDropZone.addEventListener('drop', handleDrop, false);
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
    function handleFiles(files) {
        [...files].forEach(file => {
            if (file.type.startsWith('image/')) {
                const imgObj = {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    url: URL.createObjectURL(file)
                };
                announcementImages.push(imgObj);
                renderImagePreviews();
            } else {
                const fileObj = {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    url: URL.createObjectURL(file)
                };
                announcementAttachments.push(fileObj);
                renderAttachmentPreviews();
            }
        });
    }
}

function addMarkdownToolbar() {
    const composerToolbar = document.createElement('div');
    composerToolbar.className = 'markdown-toolbar';
    composerToolbar.innerHTML = `
      <button class="toolbar-btn" data-format="bold" title="Bold">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>
      </button>
      <button class="toolbar-btn" data-format="italic" title="Italic">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>
      </button>
      <button class="toolbar-btn" data-format="heading" title="Heading">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"/><path d="M6 4v16"/><path d="M18 4v16"/></svg>
      </button>
      <button class="toolbar-btn" data-format="link" title="Link">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </button>
      <button class="toolbar-btn" data-format="list" title="Bulleted List">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </button>
      <button class="toolbar-btn" data-format="numbered-list" title="Numbered List">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>
      </button>
      <button class="toolbar-btn" data-format="quote" title="Quote">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>
      </button>
      <button class="toolbar-btn" data-format="code" title="Code">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
      </button>
      <button class="toolbar-btn" data-format="latex" title="LaTeX Math">
        <span style="font-family: serif; font-weight: bold;">∑</span>
      </button>
    `;
    const textareaContainer = document.querySelector('.write-mode');
    if (textareaContainer) {
        textareaContainer.insertBefore(composerToolbar, textareaContainer.firstChild);
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const format = this.getAttribute('data-format');
                applyMarkdownFormat(format);
            });
        });
    }
}

function applyMarkdownFormat(format) {
    const textarea = document.querySelector('.announcement-composer textarea');
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText = textarea.value.substring(selectionStart, selectionEnd);
    let replacement = '';
    let cursorOffset = 0;
    switch (format) {
        case 'bold':
            replacement = `**${selectedText}**`;
            cursorOffset = 2;
            break;
        case 'italic':
            replacement = `*${selectedText}*`;
            cursorOffset = 1;
            break;
        case 'heading':
            replacement = `# ${selectedText}`;
            cursorOffset = 2;
            break;
        case 'link':
            if (selectedText) {
                replacement = `[${selectedText}](url)`;
                cursorOffset = 3;
            } else {
                replacement = '[text](url)';
                cursorOffset = 1;
            }
            break;
        case 'list':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `- ${line}`).join('\n');
            } else {
                replacement = '- ';
            }
            break;
        case 'numbered-list':
            if (selectedText) {
                replacement = selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
            } else {
                replacement = '1. ';
            }
            break;
        case 'quote':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `> ${line}`).join('\n');
            } else {
                replacement = '> ';
            }
            break;
        case 'code':
            if (selectedText.includes('\n')) {
                replacement = '```\n' + selectedText + '\n```';
            } else {
                replacement = '`' + selectedText + '`';
                cursorOffset = 1;
            }
            break;
        case 'latex':
            if (selectedText) {
                if (selectedText.includes('\n')) {
                    // Display math for multi-line expressions
                    replacement = '$$\n' + selectedText + '\n$$';
                    cursorOffset = 3;
                } else {
                    // Inline math for single line
                    replacement = '$ ' + selectedText + ' $';
                    cursorOffset = 2;
                }
            } else {
                replacement = '$ equation $';
                cursorOffset = 10;
            }
            break;
    }
    const newText = textarea.value.substring(0, selectionStart) + replacement + textarea.value.substring(selectionEnd);
    textarea.value = newText;
    textarea.focus();
    if (selectedText) {
        textarea.setSelectionRange(selectionStart + replacement.length, selectionStart + replacement.length);
    } else {
        const newCursorPos = selectionStart + replacement.length - cursorOffset;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
    }
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
    if (document.querySelector('.preview-mode').classList.contains('active')) {
        updateMarkdownPreview();
    }
}

document.addEventListener('click', function (event) {
    if (event.target.classList.contains('comment-btn')) {
        const commentSection = event.target.closest('.announcement-card').querySelector('.comment-input');
        commentSection.style.display = commentSection.style.display === 'none' ? 'flex' : 'none';
    }
    if (event.target.classList.contains('post-comment-btn')) {
        const commentInput = event.target.previousElementSibling;
        const text = commentInput.value.trim();
        if (text) {
            const commentsList = event.target.closest('.comments-section').querySelector('.comments-list');
            const announcementCard = event.target.closest('.announcement-card');
            const announcementId = announcementCard.getAttribute('data-id');
            const token = localStorage.getItem('access_token');
            
            fetch(`/api/classrooms/${classroomId}/announcements/${announcementId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ text: text })
            })
            .then(response => response.json())
            .then(data => {
                if (data.comment) {
                    const commentHtml = `
                      <div class="comment">
                        <img src="images/image.png" alt="Profile" class="profile-pic">
                        <div class="comment-info">
                          <span class="commenter-name">${data.comment.commenterName}</span>
                          <p>${data.comment.text}</p>
                          <span class="comment-time">${new Date(data.comment.commentTime).toLocaleString()}</span>
                        </div>
                      </div>
                    `;
                    commentsList.insertAdjacentHTML('beforeend', commentHtml);
                    commentInput.value = '';
                    commentInput.closest('.comment-input').style.display = 'none';
                    
                    // Update the comment count on the button
                    const commentButton = announcementCard.querySelector('.comment-btn');
                    const commentCount = commentsList.querySelectorAll('.comment').length;
                    commentButton.textContent = `Comments (${commentCount})`;
                    
                    // Update the comment in our global array for sorting purposes
                    if (window.allAnnouncements) {
                        const announcement = window.allAnnouncements.find(a => a.announcement_id == announcementId);
                        if (announcement) {
                            if (!announcement.comments) announcement.comments = [];
                            announcement.comments.push(data.comment);
                            
                            // Resort if we're sorting by comments
                            const sortSelect = document.getElementById('sort-announcements');
                            if (sortSelect && sortSelect.value === 'comments') {
                                sortAnnouncements();
                            }
                        }
                    }
                } else {
                    alert('Failed to post comment');
                }
            })
            .catch(err => {
                console.error(err);
                alert('Error posting comment');
            });
        }
    }
    if (event.target.classList.contains('edit-btn')) {
        const announcementCard = event.target.closest('.announcement-card');
        const announcementId = announcementCard.getAttribute('data-id');
        
        // Get original announcement text from server to preserve LaTeX commands
        const token = localStorage.getItem('access_token');
        if (token) {
            fetch(`/api/classrooms/${classroomId}/announcements/${announcementId}/raw`, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.text) {
                    document.querySelector('.announcement-composer textarea').value = data.text;
                } else {
                    // Fallback to DOM extraction if API endpoint doesn't exist
                    const announcementContent = announcementCard.querySelector('.markdown-content').innerHTML;
                    let markdownText = announcementContent;
                    if (typeof DOMParser !== 'undefined') {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(announcementContent, 'text/html');
                        markdownText = doc.body.textContent || "";
                    }
                    document.querySelector('.announcement-composer textarea').value = markdownText;
                }
                
                document.querySelector('.post-btn').textContent = 'Update';
                document.querySelector('.post-btn').setAttribute('data-edit-id', announcementId);
                document.querySelector('.post-btn').disabled = false;
                document.querySelector('.announcement-composer').scrollIntoView({ behavior: 'smooth' });
            })
            .catch(err => {
                console.error("Error fetching raw announcement:", err);
                // Fallback to DOM extraction
                const announcementContent = announcementCard.querySelector('.markdown-content').innerHTML;
                let markdownText = announcementContent;
                if (typeof DOMParser !== 'undefined') {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(announcementContent, 'text/html');
                    markdownText = doc.body.textContent || "";
                }
                document.querySelector('.announcement-composer textarea').value = markdownText;
                document.querySelector('.post-btn').textContent = 'Update';
                document.querySelector('.post-btn').setAttribute('data-edit-id', announcementId);
                document.querySelector('.post-btn').disabled = false;
                document.querySelector('.announcement-composer').scrollIntoView({ behavior: 'smooth' });
            });
        } else {
            // No token, just use DOM extraction
            const announcementContent = announcementCard.querySelector('.markdown-content').innerHTML;
            let markdownText = announcementContent;
            if (typeof DOMParser !== 'undefined') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(announcementContent, 'text/html');
                markdownText = doc.body.textContent || "";
            }
            document.querySelector('.announcement-composer textarea').value = markdownText;
            document.querySelector('.post-btn').textContent = 'Update';
            document.querySelector('.post-btn').setAttribute('data-edit-id', announcementId);
            document.querySelector('.post-btn').disabled = false;
            document.querySelector('.announcement-composer').scrollIntoView({ behavior: 'smooth' });
        }
    }
    if (event.target.classList.contains('delete-btn')) {
        if (confirm('Are you sure you want to delete this announcement?')) {
            const announcementCard = event.target.closest('.announcement-card');
            const announcementId = announcementCard.getAttribute('data-id');
            const token = localStorage.getItem('access_token');
            
            // Add loading state to the button
            const deleteBtn = event.target;
            const originalText = deleteBtn.textContent;
            deleteBtn.innerHTML = '<span class="spinner"></span> Deleting...';
            deleteBtn.disabled = true;
            
            fetch(`/api/classrooms/${classroomId}/announcements/${announcementId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .then(response => {
                if (response.ok) {
                    // Remove from global array
                    if (window.allAnnouncements) {
                        window.allAnnouncements = window.allAnnouncements.filter(
                            a => a.announcement_id != announcementId
                        );
                    }
                    
                    // Add fade-out animation before removing
                    announcementCard.classList.add('fade-out');
                    setTimeout(() => {
                        announcementCard.remove();
                        showNotification('Announcement deleted successfully.', 'success');
                    }, 300);
                } else {
                    deleteBtn.innerHTML = originalText;
                    deleteBtn.disabled = false;
                    showNotification('Failed to delete announcement', 'error');
                }
            })
            .catch(err => {
                console.error(err);
                deleteBtn.innerHTML = originalText;
                deleteBtn.disabled = false;
                showNotification('Error deleting announcement', 'error');
            });
        }
    }
});

document.addEventListener('DOMContentLoaded', function () {
    setupDragAndDrop();
    const draftBtn = document.createElement('button');
    draftBtn.className = 'draft-list-btn';
    draftBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      My Drafts
    `;
    document.querySelector('.composer-actions').prepend(draftBtn);
    draftBtn.addEventListener('click', function () {
        loadDraftsList();
        const modal = document.querySelector('.drafts-modal');
        modal.style.display = 'flex';
        // Add active class after a small delay for animation
        setTimeout(() => {
            modal.classList.add('active');
            modal.querySelector('.drafts-modal-content').style.opacity = '1';
        }, 10);
    });
    document.querySelector('.close-drafts-btn')?.addEventListener('click', function () {
        const modal = document.querySelector('.drafts-modal');
        modal.classList.remove('active');
        modal.querySelector('.drafts-modal-content').style.opacity = '0';
        // Hide the modal after animation completes
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    });
    addMarkdownToolbar();
});

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
        </div>
    `;
    
    // Add it to the document
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Initial load
loadClassroomData();

function initializeQuizzes() {
    loadQuizzes();
    
    // Open quiz creation modal
    const createQuizBtn = document.getElementById('create-quiz-btn');
    if (createQuizBtn) {
        createQuizBtn.addEventListener('click', function() {
            openQuizModal();
        });
    }
    
    // Close modal when clicking the close button
    const closeModal = document.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            closeQuizModal();
        });
    }
    
    // Close modal when clicking cancel button
    const cancelQuizBtn = document.querySelector('.cancel-quiz-btn');
    if (cancelQuizBtn) {
        cancelQuizBtn.addEventListener('click', function() {
            closeQuizModal();
        });
    }
    
    // Add event listener for form submission
    const quizForm = document.getElementById('quiz-form');
    if (quizForm) {
        quizForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveQuiz();
        });
    }
    
    // Add event listener for adding a new question
    const addQuestionBtn = document.getElementById('add-question-btn');
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', function() {
            addNewQuestion();
        });
    }
    
    // Add event delegation for dynamic elements
    const questionsContainer = document.getElementById('questions-container');
    if (questionsContainer) {
        questionsContainer.addEventListener('click', function(e) {
            // Handle question removal
            if (e.target.closest('.remove-question-btn')) {
                const questionCard = e.target.closest('.question-card');
                if (questionCard && questionsContainer.children.length > 1) {
                    questionCard.remove();
                    renumberQuestions();
                } else {
                    showNotification('A quiz must have at least one question', 'warning');
                }
            }
            
            // Handle option removal
            if (e.target.closest('.remove-option-btn')) {
                const option = e.target.closest('.option');
                const optionsContainer = option.closest('.options-container');
                if (optionsContainer && optionsContainer.children.length > 2) {
                    option.remove();
                    renumberOptions(optionsContainer);
                } else {
                    showNotification('A question must have at least two options', 'warning');
                }
            }
            
            // Handle adding options
            if (e.target.closest('.add-option-btn')) {
                const questionCard = e.target.closest('.question-card');
                const optionsContainer = questionCard.querySelector('.options-container');
                addNewOption(optionsContainer, questionCard.dataset.questionId);
            }
        });
    }
    
    // Set up event delegation for quiz list actions
    const quizList = document.querySelector('.quiz-list');
    if (quizList) {
        quizList.addEventListener('click', function(e) {
            // Edit quiz
            if (e.target.closest('.edit-quiz-btn')) {
                const quizCard = e.target.closest('.quiz-card');
                const quizId = quizCard.dataset.quizId;
                editQuiz(quizId);
            }
            
            // View results
            if (e.target.closest('.results-btn')) {
                const quizCard = e.target.closest('.quiz-card');
                const quizId = quizCard.dataset.quizId;
                viewQuizResults(quizId);
            }
            
            // Delete quiz
            if (e.target.closest('.delete-quiz-btn')) {
                const quizCard = e.target.closest('.quiz-card');
                const quizId = quizCard.dataset.quizId;
                if (confirm('Are you sure you want to delete this quiz?')) {
                    deleteQuiz(quizId);
                }
            }
        });
    }
    
    // Set default start and end dates
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startDateInput = document.getElementById('quiz-start-date');
    const endDateInput = document.getElementById('quiz-end-date');
    const startTimeInput = document.getElementById('quiz-start-time');
    const endTimeInput = document.getElementById('quiz-end-time');
    
    if (startDateInput && endDateInput && startTimeInput && endTimeInput) {
        startDateInput.valueAsDate = today;
        endDateInput.valueAsDate = tomorrow;
        
        const hours = today.getHours().toString().padStart(2, '0');
        const minutes = today.getMinutes().toString().padStart(2, '0');
        startTimeInput.value = `${hours}:${minutes}`;
        endTimeInput.value = `${hours}:${minutes}`;
    }
}

function openQuizModal(quizData = null) {
    // Set current editing quiz ID
    currentEditingQuizId = quizData ? quizData.id : null;
    
    // Set modal title based on whether we're creating or editing
    document.querySelector('.modal-header h3').textContent = quizData ? 'Edit Quiz' : 'Create New Quiz';
    
    // Reset the form first
    resetQuizForm();
    
    // If editing, fill in form with existing data
    if (quizData) {
        document.getElementById('quiz-title').value = quizData.title || '';
        document.getElementById('quiz-description').value = quizData.description || '';
        
        // Handle date/time fields
        if (quizData.startTime) {
            const startDate = new Date(quizData.startTime);
            
            // Format date as YYYY-MM-DD for input[type="date"]
            const dateString = startDate.toISOString().split('T')[0];
            document.getElementById('quiz-start-date').value = dateString;
            
            // Format time as HH:MM for input[type="time"]
            const hours = String(startDate.getHours()).padStart(2, '0');
            const minutes = String(startDate.getMinutes()).padStart(2, '0');
            document.getElementById('quiz-start-time').value = `${hours}:${minutes}`;
        }
        
        // Set duration
        document.getElementById('quiz-duration').value = quizData.duration || 60;
        
        // Set published status
        document.getElementById('quiz-published').checked = quizData.published !== false;
        
        // Note: When editing, we don't re-upload the PDF files
        // Instead, show information about the current files
        if (quizData.quizType === 'pdf') {
            const questionPaperNote = document.createElement('div');
            questionPaperNote.className = 'file-note';
            questionPaperNote.innerHTML = `
                <p>Current file: <strong>${quizData.questionPaper?.filename || 'No file'}</strong></p>
                <p class="note">Upload a new file only if you want to replace the current one.</p>
            `;
            
            const answerKeyNote = document.createElement('div');
            answerKeyNote.className = 'file-note';
            answerKeyNote.innerHTML = `
                <p>Current file: <strong>${quizData.answerKey?.filename || 'No file'}</strong></p>
                <p class="note">Upload a new file only if you want to replace the current one.</p>
            `;
            
            // Insert after each file input
            const questionPaperInput = document.getElementById('question-paper');
            questionPaperInput.insertAdjacentElement('afterend', questionPaperNote);
            questionPaperInput.required = false; // Not required when editing
            
            const answerKeyInput = document.getElementById('answer-key');
            answerKeyInput.insertAdjacentElement('afterend', answerKeyNote);
        }
    }
    
    // Show the modal
    const modal = document.getElementById('quiz-modal');
    modal.style.display = 'block';
    
    // Fade in the modal content
    setTimeout(() => {
        modal.classList.add('active');
        modal.querySelector('.modal-content').style.opacity = '1';
    }, 10);
}

function closeQuizModal() {
    const modal = document.getElementById('quiz-modal');
    modal.classList.remove('active');
    modal.querySelector('.modal-content').style.opacity = '0';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
    
    // Reset form
    resetQuizForm();
    currentEditingQuizId = null;
}

function resetQuizForm() {
    const form = document.getElementById('quiz-form');
    form.reset();
    
    // Reset any existing file notes
    document.querySelectorAll('.file-note').forEach(note => note.remove());
    
    // Make question paper required for new quizzes
    const questionPaperInput = document.getElementById('question-paper');
    if (questionPaperInput) {
        questionPaperInput.required = true;
    }
    
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateInput = document.getElementById('quiz-start-date');
    if (dateInput) {
        dateInput.valueAsDate = tomorrow;
    }
    
    // Set reasonable default time (9:00 AM)
    const timeInput = document.getElementById('quiz-start-time');
    if (timeInput) {
        timeInput.value = '09:00';
    }
    
    // Clear any validation messages
    document.querySelectorAll('.error-message').forEach(msg => msg.remove());
}

function addNewQuestion() {
    const questionsContainer = document.getElementById('questions-container');
    const questionHTML = createQuestionHTML(nextQuestionId);
    questionsContainer.insertAdjacentHTML('beforeend', questionHTML);
    nextQuestionId++;
}

function createQuestionHTML(questionId, questionText = '') {
    return `
        <div class="question-card" data-question-id="${questionId}">
            <div class="question-header">
                <h5>Question ${questionId}</h5>
                <button type="button" class="remove-question-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-group">
                <label>Question Text</label>
                <textarea class="question-text" required placeholder="Enter your question">${questionText}</textarea>
            </div>
            <div class="options-container">
                <div class="option" data-option-id="1">
                    <div class="option-row">
                        <input type="radio" name="correctOption_${questionId}" value="1" required>
                        <input type="text" class="option-text" placeholder="Option 1" required>
                        <button type="button" class="remove-option-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="option" data-option-id="2">
                    <div class="option-row">
                        <input type="radio" name="correctOption_${questionId}" value="2" required>
                        <input type="text" class="option-text" placeholder="Option 2" required>
                        <button type="button" class="remove-option-btn"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            </div>
            <button type="button" class="add-option-btn btn btn-small btn-outline"><i class="fas fa-plus"></i> Add Option</button>
        </div>
    `;
}

function addNewOption(optionsContainer, questionId) {
    const options = optionsContainer.querySelectorAll('.option');
    const newOptionId = options.length + 1;
    const optionHTML = createOptionHTML(questionId, newOptionId);
    optionsContainer.insertAdjacentHTML('beforeend', optionHTML);
}

function createOptionHTML(questionId, optionId, optionText = '') {
    return `
        <div class="option" data-option-id="${optionId}">
            <div class="option-row">
                <input type="radio" name="correctOption_${questionId}" value="${optionId}" required>
                <input type="text" class="option-text" placeholder="Option ${optionId}" value="${optionText}" required>
                <button type="button" class="remove-option-btn"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `;
}

function renumberQuestions() {
    const questionCards = document.querySelectorAll('.question-card');
    questionCards.forEach((card, index) => {
        const questionId = index + 1;
        card.dataset.questionId = questionId;
        card.querySelector('h5').textContent = `Question ${questionId}`;
        
        // Update radio button names
        const radioButtons = card.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
            radio.name = `correctOption_${questionId}`;
        });
    });
}

function renumberOptions(optionsContainer) {
    const options = optionsContainer.querySelectorAll('.option');
    options.forEach((option, index) => {
        const optionId = index + 1;
        option.dataset.optionId = optionId;
        option.querySelector('input[type="radio"]').value = optionId;
        const textInput = option.querySelector('input[type="text"]');
        if (!textInput.value) {
            textInput.placeholder = `Option ${optionId}`;
        }
    });
}

function saveQuiz() {
    // Get form data
    const title = document.getElementById('quiz-title').value;
    const description = document.getElementById('quiz-description').value;
    const startDate = document.getElementById('quiz-start-date').value;
    const startTime = document.getElementById('quiz-start-time').value;
    const duration = document.getElementById('quiz-duration').value;
    const questionPaperInput = document.getElementById('question-paper');
    const answerKeyInput = document.getElementById('answer-key');
    const questionPaperFile = questionPaperInput.files[0];
    const answerKeyFile = answerKeyInput.files[0];
    const published = document.getElementById('quiz-published').checked;
    
    // Check if we're editing an existing quiz
    const isEdit = !!currentEditingQuizId;
    
    // Check for token first
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No access token found - cannot save quiz');
        showNotification('Authorization error: Please log in again', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
        return;
    }
    
    // Validate inputs
    if (!title || !startDate || !startTime || !duration) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // When creating a new quiz, question paper is required
    if (!isEdit && !questionPaperFile) {
        showNotification('Please upload a question paper PDF', 'error');
        return;
    }
    
    // Validate file types if provided
    if (questionPaperFile && !questionPaperFile.type.match('application/pdf')) {
        showNotification('Question paper must be a PDF file', 'error');
        return;
    }
    
    if (answerKeyFile && !answerKeyFile.type.match('application/pdf')) {
        showNotification('Answer key must be a PDF file', 'error');
        return;
    }
    
    // Create ISO 8601 formatted datetime string that Python can properly parse
    // Format as YYYY-MM-DDTHH:MM:SS
    const formattedStartDateTime = `${startDate}T${startTime}:00`;
    const startDateTime = new Date(formattedStartDateTime);
    
    // Calculate end time based on start time + duration
    const endDateTime = new Date(startDateTime.getTime() + (parseInt(duration) * 60000));
    
    // Log times for debugging
    console.log('Start date string:', formattedStartDateTime);
    console.log('Start time (local):', startDateTime.toLocaleString());
    console.log('End time (calculated):', endDateTime.toLocaleString());
    
    // Show loading state
    const saveBtn = document.querySelector('.save-quiz-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Create FormData object for file uploads
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('startTime', formattedStartDateTime);
    formData.append('duration', duration);
    formData.append('published', published.toString());
    
    // Only append files if they are provided
    // For new quizzes, question paper is required
    // For existing quizzes, only include files if new ones are selected
    if (questionPaperFile) {
        formData.append('questionPaper', questionPaperFile);
    }
    
    if (answerKeyFile) {
        formData.append('answerKey', answerKeyFile);
    }
    
    // For debugging
    console.log(`Preparing to ${isEdit ? 'update' : 'create'} quiz data with files:`, {
        title,
        description,
        startTime: formattedStartDateTime,
        duration,
        published: published.toString(),
        hasQuestionPaper: !!questionPaperFile,
        hasAnswerKey: !!answerKeyFile
    });
    
    // Save to database instead of localStorage
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit 
        ? `/api/classrooms/${classroomId}/quizzes/${currentEditingQuizId}` 
        : `/api/classrooms/${classroomId}/quizzes`;
    
    fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${token}`
            // Note: Don't set Content-Type header for FormData
        },
        body: formData
    })
    .then(response => {
        console.log('Server response status:', response.status);
        if (response.status === 401 || response.status === 403) {
            console.error('Authentication failed - token may be invalid or expired');
            showNotification('Session expired. Please log in again.', 'error');
            setTimeout(() => {
                localStorage.removeItem('access_token');
                window.location.href = '/login';
            }, 2000);
            throw new Error('Authentication failed');
        }
        if (!response.ok) {
            return response.json().then(errorData => {
                console.error('Server error response:', errorData);
                const errorMsg = errorData.msg || 'Failed to save quiz';
                console.error('Error creating quiz:', errorMsg);
                throw new Error(errorMsg);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Server response data:', data);
        
        // If this is a new quiz, update the ID
        if (!isEdit && data.quiz && data.quiz.id) {
            currentEditingQuizId = data.quiz.id;
            
            // Add to local array with complete data from server
            const newQuiz = {
                id: data.quiz.id,
                title: title,
                description: description,
                startTime: formattedStartDateTime,
                duration: parseInt(duration),
                quizType: 'pdf',
                questionPaper: data.quiz.questionPaper,
                answerKey: data.quiz.answerKey,
                status: getQuizStatus(startDateTime, endDateTime),
                published: published
            };
            quizzes.push(newQuiz);
        } else if (isEdit) {
            // Update local array
            const index = quizzes.findIndex(q => q.id === currentEditingQuizId);
            if (index !== -1) {
                // Preserve existing question paper and answer key if not updated
                const existingQuestionPaper = !questionPaperFile ? quizzes[index].questionPaper : data.quiz.questionPaper;
                const existingAnswerKey = !answerKeyFile ? quizzes[index].answerKey : data.quiz.answerKey;
                
                quizzes[index] = {
                    ...quizzes[index],
                    title: title,
                    description: description,
                    startTime: formattedStartDateTime,
                    duration: parseInt(duration),
                    quizType: 'pdf',
                    questionPaper: existingQuestionPaper,
                    answerKey: existingAnswerKey,
                    status: getQuizStatus(startDateTime, endDateTime),
                    published: published
                };
            }
        }
        
        // Show success message
        showNotification(isEdit ? 'Quiz updated successfully' : 'Quiz created successfully', 'success');
        
        // Refresh quiz list
        renderQuizzes();
        
        // Close modal
        closeQuizModal();
    })
    .catch(error => {
        console.error('Error saving quiz:', error);
        if (error.message !== 'Authentication failed') {
            // Extract and display the specific error message
            let errorMessage = error.message || 'Failed to save quiz';
            showNotification(errorMessage, 'error');
        }
    })
    .finally(() => {
        // Restore button state
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    });
}

function getQuizStatus(startDateTime, endDateTime) {
    const now = new Date();
    
    if (now < startDateTime) {
        return 'scheduled';
    } else if (now > endDateTime) {
        return 'expired';
    } else {
        return 'published';
    }
}

function loadQuizzes() {
    // Check for token first
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No access token found - cannot load quizzes');
        showNotification('Authorization error: Please log in again', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
        return;
    }
    
    console.log('Using token to fetch quizzes:', token.substring(0, 10) + '...');
    
    // Fetch quizzes from database instead of localStorage
    fetch(`/api/classrooms/${classroomId}/quizzes`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        console.log('Quiz fetch status:', response.status);
        if (response.status === 401 || response.status === 403) {
            console.error('Authentication failed - token may be invalid or expired');
            showNotification('Session expired. Please log in again.', 'error');
            setTimeout(() => {
                localStorage.removeItem('access_token');
                window.location.href = '/login';
            }, 2000);
            throw new Error('Authentication failed');
        }
        if (!response.ok) {
            return response.json().then(errorData => {
                console.error('Server error response when fetching quizzes:', errorData);
                throw new Error(errorData.msg || 'Failed to fetch quizzes');
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Received quizzes data:', data);
        quizzes = data;
        
        // Process quizzes to ensure they have proper date objects
        quizzes.forEach(quiz => {
            // Update status for each quiz
            quiz.status = getQuizStatus(new Date(quiz.startTime), new Date(quiz.endTime));
        });
        
        renderQuizzes();
    })
    .catch(error => {
        console.error('Error loading quizzes:', error);
        if (error.message !== 'Authentication failed') {
            showNotification('Failed to load quizzes: ' + error.message, 'error');
            quizzes = [];
            renderQuizzes();
        }
    });
}

function renderQuizzes() {
    const quizList = document.querySelector('.quiz-list');
    if (!quizList) return;
    
    // Update status for each quiz
    quizzes.forEach(quiz => {
        quiz.status = getQuizStatus(new Date(quiz.startTime), new Date(quiz.endTime));
    });
    
    // Sort quizzes by created date (newest first), with fallback to startTime
    quizzes.sort((a, b) => {
        // Prefer createdAt if available for both
        if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
        // Otherwise use startTime as fallback
        return new Date(b.startTime) - new Date(a.startTime);
    });
    
    quizList.innerHTML = '';
    
    if (quizzes.length === 0) {
        quizList.innerHTML = `
            <div class="no-quizzes">
                <p>No quizzes yet. Click "Create New Quiz" to get started.</p>
            </div>
        `;
        return;
    }
    
    quizzes.forEach(quiz => {
        const startDate = new Date(quiz.startTime);
        const formattedDate = startDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        const formattedTime = startDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const statusLabel = {
            'draft': 'Draft',
            'scheduled': 'Scheduled',
            'published': 'Published',
            'expired': 'Expired'
        };
        
        // Check if this is a PDF quiz
        const isPdfQuiz = quiz.quizType === 'pdf';
        
        // Create the quiz info section with appropriate metadata
        let quizMetaHTML = `
            <span class="date"><i class="fas fa-calendar-check"></i> ${formattedDate} - ${formattedTime}</span>
            <span class="quiz-status ${quiz.status}">${statusLabel[quiz.status] || 'Unknown'}</span>
        `;
        
        if (isPdfQuiz) {
            // Show PDF info for PDF quizzes
            const hasPaper = quiz.questionPaper && quiz.questionPaper.filename;
            const hasAnswerKey = quiz.answerKey && quiz.answerKey.filename;
            
            quizMetaHTML += `
                <span class="quiz-type pdf"><i class="fas fa-file-pdf"></i> PDF Quiz</span>
                ${hasPaper ? `<span class="quiz-paper"><i class="fas fa-file-alt"></i> ${quiz.questionPaper.filename}</span>` : ''}
                ${hasAnswerKey ? `<span class="quiz-key"><i class="fas fa-key"></i> Answer Key</span>` : ''}
            `;
        } else {
            // Show question count for regular quizzes
            quizMetaHTML += `
                <span class="quiz-questions"><i class="fas fa-question-circle"></i> ${quiz.questions ? quiz.questions.length : 0} Question${quiz.questions && quiz.questions.length !== 1 ? 's' : ''}</span>
            `;
        }
        
        // Calculate submission count if available
        let submissionInfo = '';
        if (quiz.submissionStats) {
            if (isPdfQuiz) {
                // For PDF quizzes, show graded vs total
                const gradedCount = quiz.submissionStats.gradedCount || 0;
                const totalCount = quiz.submissionStats.submissionCount || 0;
                submissionInfo = `
                    <span class="submission-info">
                        <i class="fas fa-users"></i> 
                        ${totalCount} Submission${totalCount !== 1 ? 's' : ''} (${gradedCount} Graded)
                    </span>
                `;
            } else {
                // For regular quizzes, just show total
                const count = quiz.submissionStats.submissionCount || 0;
                submissionInfo = `
                    <span class="submission-info">
                        <i class="fas fa-users"></i> 
                        ${count} Submission${count !== 1 ? 's' : ''}
                    </span>
                `;
            }
        }
        
        // Add download buttons for PDF quizzes
        let downloadButtons = '';
        if (isPdfQuiz) {
            downloadButtons = `
                <button class="btn btn-outline download-paper-btn">
                    <i class="fas fa-download"></i> Question Paper
                </button>
            `;
            
            if (quiz.answerKey) {
                downloadButtons += `
                    <button class="btn btn-outline download-key-btn">
                        <i class="fas fa-download"></i> Answer Key
                    </button>
                `;
            }
        }
        
        quizList.insertAdjacentHTML('beforeend', `
            <div class="quiz-card ${isPdfQuiz ? 'pdf-quiz' : ''}" data-quiz-id="${quiz.id}">
                <div class="quiz-info">
                    <h3>${quiz.title}</h3>
                    <p>${quiz.description || ''}</p>
                    <div class="quiz-meta">
                        ${quizMetaHTML}
                    </div>
                    ${submissionInfo}
                </div>
                <div class="quiz-actions">
                    ${downloadButtons}
                    <button class="btn btn-outline edit-quiz-btn"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-outline results-btn"><i class="fas fa-chart-bar"></i> Results</button>
                    <button class="btn btn-outline delete-quiz-btn"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `);
    });
    
    // Add event listeners for PDF download buttons
    document.querySelectorAll('.download-paper-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const quizId = e.target.closest('.quiz-card').dataset.quizId;
            const token = localStorage.getItem('access_token');
            window.open(`/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/questionPaper?token=${token}`, '_blank');
        });
    });
    
    document.querySelectorAll('.download-key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const quizId = e.target.closest('.quiz-card').dataset.quizId;
            const token = localStorage.getItem('access_token');
            window.open(`/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/answerKey?token=${token}`, '_blank');
        });
    });
}

function editQuiz(quizId) {
    const quiz = quizzes.find(q => q.id === quizId);
    if (quiz) {
        openQuizModal(quiz);
    }
}

function deleteQuiz(quizId) {
    // Show confirmation dialog
    if (!confirm('Are you sure you want to delete this quiz?')) {
        return;
    }
    
    // Check for token first
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No access token found - cannot delete quiz');
        showNotification('Authorization error: Please log in again', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
        return;
    }
    
    // Show loading state in the UI
    const quizCard = document.querySelector(`.quiz-card[data-quiz-id="${quizId}"]`);
    if (quizCard) {
        quizCard.classList.add('deleting');
        quizCard.innerHTML = '<div class="deleting-message"><i class="fas fa-spinner fa-spin"></i> Deleting...</div>';
    }
    
    // Delete from database
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        console.log('Delete quiz response status:', response.status);
        if (response.status === 401 || response.status === 403) {
            console.error('Authentication failed - token may be invalid or expired');
            showNotification('Session expired. Please log in again.', 'error');
            setTimeout(() => {
                localStorage.removeItem('access_token');
                window.location.href = '/login';
            }, 2000);
            throw new Error('Authentication failed');
        }
        if (!response.ok) {
            return response.json().then(errorData => {
                console.error('Server error response when deleting quiz:', errorData);
                throw new Error(errorData.msg || 'Failed to delete quiz');
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Quiz deletion response:', data);
        
        // Remove from local array
        quizzes = quizzes.filter(quiz => quiz.id !== quizId);
        
        // Update UI
        renderQuizzes();
        
        // Show success message
        showNotification('Quiz deleted successfully', 'success');
    })
    .catch(error => {
        console.error('Error deleting quiz:', error);
        // Don't show error message if redirecting due to auth issues
        if (error.message !== 'Authentication failed') {
            // Remove the deleting state if there was an error
            if (quizCard) {
                quizCard.classList.remove('deleting');
            }
            showNotification('Failed to delete quiz: ' + error.message, 'error');
            // Refresh quiz list to restore proper state
            loadQuizzes();
        }
    });
}

function viewQuizResults(quizId) {
    // Show loading spinner
    document.getElementById('results-loading').style.display = 'flex';
    document.getElementById('results-content').style.display = 'none';
    
    // Show the results modal
    const resultsModal = document.getElementById('quiz-results-modal');
    resultsModal.style.display = 'block';
    setTimeout(() => {
        resultsModal.classList.add('active');
        resultsModal.querySelector('.modal-content').style.opacity = '1';
    }, 10);
    
    // Fetch quiz results from database
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch quiz results');
        }
        return response.json();
    })
    .then(results => {
        // Get the quiz details
        const quiz = quizzes.find(q => q.id === quizId);
        const isPdfQuiz = quiz && quiz.quizType === 'pdf';
        
        document.getElementById('results-modal-title').textContent = `Results: ${results.quizTitle}`;
        
        // Update statistics
        document.getElementById('stat-submissions').textContent = results.statistics.submissions;
        document.getElementById('stat-average').textContent = `${results.statistics.averageScore}%`;
        document.getElementById('stat-highest').textContent = `${results.statistics.highestScore}%`;
        document.getElementById('stat-lowest').textContent = `${results.statistics.lowestScore}%`;
        
        // Update table
        const tableBody = document.getElementById('results-table-body');
        tableBody.innerHTML = '';
        
        if (results.submissions.length === 0) {
            document.getElementById('no-submissions').style.display = 'block';
            document.querySelector('.results-table-container').style.display = 'none';
        } else {
            document.getElementById('no-submissions').style.display = 'none';
            document.querySelector('.results-table-container').style.display = 'block';
            
            results.submissions.forEach(submission => {
                const submissionDate = new Date(submission.submittedAt);
                const formattedDate = submissionDate.toLocaleString();
                
                let actionsHtml = '';
                
                if (isPdfQuiz) {
                    // For PDF quizzes, show different actions
                    actionsHtml = `
                        <button class="btn btn-sm btn-outline view-pdf-btn" data-student-id="${submission.student_id || submission['student_id']}">
                            <i class="fas fa-file-pdf"></i> View Submission
                        </button>
                        <button class="btn btn-sm btn-outline grade-pdf-btn" data-student-id="${submission.student_id || submission['student_id']}">
                            ${submission.isGraded ? '<i class="fas fa-edit"></i> Edit Grade' : '<i class="fas fa-check"></i> Grade'}
                        </button>
                    `;
                } else {
                    // For regular quizzes, show view details button
                    actionsHtml = `
                        <button class="btn btn-sm btn-outline view-details-btn" data-student-id="${submission.student_id || submission['student_id']}">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    `;
                }
                
                // Create the row with appropriate elements
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${submission.studentName}</td>
                    <td>${submission.isGraded ? `${submission.percentage}%` : 'Not graded'}</td>
                    <td>${formattedDate}</td>
                    <td class="actions">${actionsHtml}</td>
                `;
                
                tableBody.appendChild(row);
            });
            
            // Add event listeners for PDF-specific buttons
            if (isPdfQuiz) {
                // View PDF submission - add JWT token to URL
                document.querySelectorAll('.view-pdf-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const studentId = e.target.closest('.view-pdf-btn').dataset.studentId;
                        const token = localStorage.getItem('access_token');
                        const pdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/pdf?token=${token}`;
                        window.open(pdfUrl, '_blank');
                    });
                });
                
                // Grade PDF submission
                document.querySelectorAll('.grade-pdf-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const studentId = e.target.closest('.grade-pdf-btn').dataset.studentId;
                        showGradeSubmissionModal(quizId, studentId);
                    });
                });
            } else {
                // For regular quizzes, add view details listener
                document.querySelectorAll('.view-details-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const studentId = e.target.closest('.view-details-btn').dataset.studentId;
                        viewStudentDetail(quizId, studentId);
                    });
                });
            }
        }
        
        // Hide loading spinner, show content
        document.getElementById('results-loading').style.display = 'none';
        document.getElementById('results-content').style.display = 'block';
    })
    .catch(error => {
        console.error('Error fetching quiz results:', error);
        document.getElementById('results-loading').style.display = 'none';
        document.getElementById('results-content').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load quiz results. Please try again later.</p>
                <p class="error-details">${error.message}</p>
            </div>
        `;
    });
}

function showGradeSubmissionModal(quizId, studentId) {
    // Create modal if it doesn't exist
    let gradeModal = document.getElementById('grade-submission-modal');
    
    if (!gradeModal) {
        // Create the modal element
        gradeModal = document.createElement('div');
        gradeModal.id = 'grade-submission-modal';
        gradeModal.className = 'modal';
        
        gradeModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Grade Submission</h3>
                    <button class="close-grade-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="grade-loading" class="loading-container">
                        <div class="spinner"></div>
                        <p>Loading submission...</p>
                    </div>
                    
                    <div id="grade-form-container" style="display: none;">
                        <div class="submission-preview">
                            <h4>Student Submission</h4>
                            <div class="pdf-info">
                                <i class="fas fa-file-pdf"></i>
                                <span id="submission-filename">answer.pdf</span>
                                <a id="view-submission-pdf" class="btn btn-sm btn-outline" target="_blank">
                                    <i class="fas fa-external-link-alt"></i> Open PDF
                                </a>
                            </div>
                        </div>
                        
                        <form id="grade-submission-form">
                            <div class="form-group">
                                <label for="submission-score">Score</label>
                                <input type="number" id="submission-score" min="0" max="100" step="0.1" required placeholder="Enter score (0-100)">
                                <span class="form-info">Out of 100 points</span>
                            </div>
                            
                            <div class="form-group">
                                <label for="submission-feedback">Feedback (Optional)</label>
                                <textarea id="submission-feedback" rows="4" placeholder="Enter feedback for the student"></textarea>
                            </div>
                            
                            <div class="form-actions">
                                <button type="button" class="btn btn-outline cancel-grade-btn">Cancel</button>
                                <button type="submit" class="btn btn-primary save-grade-btn">Save Grade</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(gradeModal);
        
        // Add event listeners
        gradeModal.querySelector('.close-grade-modal').addEventListener('click', () => {
            gradeModal.style.display = 'none';
        });
        
        gradeModal.querySelector('.cancel-grade-btn').addEventListener('click', () => {
            gradeModal.style.display = 'none';
        });
        
        gradeModal.querySelector('#grade-submission-form').addEventListener('submit', (e) => {
            e.preventDefault();
            submitGrade(quizId, studentId);
        });
    }
    
    // Show loading state
    gradeModal.style.display = 'block';
    gradeModal.querySelector('#grade-loading').style.display = 'flex';
    gradeModal.querySelector('#grade-form-container').style.display = 'none';
    
    // Set up the PDF link in grade modal - add JWT token to URL
    const token = localStorage.getItem('access_token');
    const pdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/pdf?token=${token}`;
    gradeModal.querySelector('#view-submission-pdf').href = pdfUrl;
    
    // Fetch submission details if we need them (like current grade if editing)
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
    })
    .then(response => response.json())
    .then(results => {
        console.log('Fetched results to grade submission, looking for student ID:', studentId);
        
        // Find the specific submission
        const submission = results.submissions.find(s => {
            // Try different possible ways the student ID might be stored
            return (s.studentId === studentId || 
                   s.student_id === studentId || 
                   (s.student_id && s.student_id.toString() === studentId) ||
                   (s['student_id'] && s['student_id'].toString() === studentId));
        });
        
        if (submission) {
            console.log('Found submission to grade:', submission);
            
            // If we're editing an existing grade
            if (submission.isGraded) {
                document.getElementById('submission-score').value = submission.score || 0;
                document.getElementById('submission-feedback').value = submission.feedback || '';
            }
            
            // Set filename
            if (submission.answerFile && submission.answerFile.filename) {
                document.getElementById('submission-filename').textContent = submission.answerFile.filename;
            }
            
            // Show the form
            gradeModal.querySelector('#grade-loading').style.display = 'none';
            gradeModal.querySelector('#grade-form-container').style.display = 'block';
        } else {
            console.error('Submission not found for student ID:', studentId);
            console.log('Available submissions:', results.submissions);
            throw new Error('Submission not found');
        }
    })
    .catch(error => {
        console.error('Error loading submission details:', error);
        gradeModal.querySelector('#grade-loading').style.display = 'none';
        gradeModal.querySelector('#grade-form-container').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load submission details. Please try again later.</p>
            </div>
        `;
    });
}

function submitGrade(quizId, studentId) {
    // Log the student ID to debug
    console.log('Submitting grade for student:', studentId);
    
    // Get values from form
    const score = parseFloat(document.getElementById('submission-score').value);
    const feedback = document.getElementById('submission-feedback').value;
    
    // Validate
    if (isNaN(score) || score < 0 || score > 100) {
        alert('Please enter a valid score between 0 and 100');
        return;
    }
    
    // Show loading state
    const submitBtn = document.querySelector('.save-grade-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Prepare data
    const gradeData = {
        score: score,
        maxScore: 100,
        feedback: feedback
    };
    
    // Submit to server
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/grade-pdf`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(gradeData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.msg || 'Failed to save grade');
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Grade saved successfully:', data);
        
        // Close modal
        document.getElementById('grade-submission-modal').style.display = 'none';
        
        // Show success message
        showNotification('Grade saved successfully', 'success');
        
        // Refresh the quiz results
        viewQuizResults(quizId);
    })
    .catch(error => {
        console.error('Error saving grade:', error);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        alert(`Error saving grade: ${error.message}`);
    });
}

function viewStudentDetail(quizId, studentId) {
    // For now, just redirect to a URL that the student would use to see their results
    // In a production system, you'd want to create a separate view for teachers to see student details
    const studentResultsUrl = `/quiz-results?classId=${classroomId}&quizId=${quizId}&studentId=${studentId}`;
    window.open(studentResultsUrl, '_blank');
}

// Helper function to set background image based on subject
function useSubjectBasedImage(subject, headerElement) {
    const subjectLower = (subject || '').toLowerCase();
    let themeImage = 'https://gstatic.com/classroom/themes/Physics.jpg'; // Default
    headerElement.style.backgroundImage = `url('${themeImage}')`;
}
