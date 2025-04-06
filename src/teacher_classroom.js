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
            
            // Initialize performance dashboard if switching to the performance tab
            if (tabId === 'performance') {
                if (typeof Chart === 'undefined') {
                    const chartScript = document.createElement('script');
                    chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
                    chartScript.onload = initializePerformanceDashboard;
                    document.head.appendChild(chartScript);
                } else {
                    initializePerformanceDashboard();
                }
            }
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
if (!classroomId || classroomId === 'null') {
    alert('Classroom ID not provided in URL');
    // Redirect to a more appropriate page, such as the teacher dashboard
    window.location.href = '/teacher_after_login.html';
}

// Validate that classroomId is a valid MongoDB ObjectId (24-character hex string)
if (!isValidObjectId(classroomId)) {
    alert('Invalid Classroom ID format');
    // Redirect to a more appropriate page
    window.location.href = '/teacher_after_login.html';
}

let teacherNameGlobal = "";
let teacherAvatarGlobal = "images/image.png";
let announcementAttachments = [];
let announcementImages = [];
let draftAnnouncements = {};

// Quiz Management
let quizzes = [];
let editingQuizId = null;
let quizTabInitialized = false;

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
            // Log data for debugging
            console.log('Classroom data received:', data);
            
            teacherNameGlobal = data.teacherName || "Teacher Name";
            
            // Update classroom header
            const header = document.querySelector('.classroom-header');
            document.querySelector('.classroom-header h1').textContent = data.className || "Course Name";
            document.querySelector('.classroom-header p').textContent = `${data.section || "Section"} - ${data.subject || "Subject"}`;
            
            // Room information
            if (data.room) {
                const roomElement = document.querySelector('.classroom-header .room');
                if (roomElement) {
                    roomElement.textContent = data.room;
                } else {
                    const roomDiv = document.createElement('div');
                    roomDiv.className = 'room';
                    header.appendChild(roomDiv);
                }
            }
            
            
            // Set classroom background image from the database
            if (data.headerImage) {
                // Try to use the image URL from the database
                const img = new Image();
                img.onload = function() {
                    // Image loaded successfully, use it
                    header.style.backgroundImage = `url('${data.headerImage}')`;
                };
                img.onerror = function() {
                    // Image failed to load, use subject-based fallback
                    useSubjectBasedImage(data.subject, header);
                };
                img.src = data.headerImage;
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
            
            // Update enrolled students information if present
            if (data.enrolled_students && data.enrolled_students.length) {
                const studentCountElement = document.querySelector('.student-count');
                if (studentCountElement) {
                    studentCountElement.textContent = `${data.enrolled_students.length} Students`;
                } else {
                    const studentCountDiv = document.createElement('div');
                    studentCountDiv.className = 'student-count';
                    studentCountDiv.textContent = `${data.enrolled_students.length} Students`;
                    const infoSection = document.querySelector('.classroom-info') || header;
                    infoSection.appendChild(studentCountDiv);
                }
            }
            
            // Sort announcements by default (newest first)
            sortAnnouncementsByDate('newest');
            
            // Store quizzes in global variable for access elsewhere
            if (data.quizzes && data.quizzes.length) {
                quizzes = data.quizzes;
                // Will call renderQuizzes if initializeQuizzes has already run
                if (quizTabInitialized) {
                    renderQuizzes();
                }
            }
        })
        .catch(err => {
            console.error('Error loading classroom data:', err);
            showNotification('Failed to load classroom data', 'error');
        });
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
    quizTabInitialized = true;
    
    // Skip if elements don't exist (not on the quizzes tab)
    const quizTabContent = document.querySelector('#quizzes');
    if (!quizTabContent) {
        console.log('Quiz tab elements not found, skipping initialization');
        return;
    }
    
    console.log('Initializing quiz functionality');
    
    loadQuizzes();
    
    // Create Quiz Button
    const createQuizBtn = document.querySelector('#create-quiz-btn');
    if (createQuizBtn) {
        createQuizBtn.addEventListener('click', () => {
            openQuizModal();
        });
    }
    
    // Setup quiz modal close button
    const closeModalBtn = document.querySelector('.close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeQuizModal);
    }
    
    // Setup cancel button
    const cancelBtn = document.querySelector('.cancel-quiz-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeQuizModal);
    }
    
    // Setup quiz form submission
    const quizForm = document.getElementById('quiz-form');
    if (quizForm) {
        quizForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveQuiz();
        });
    }
    
    // Setup quiz modal functionality
    // ... rest of the function remains the same
}

function openQuizModal(quizData = null) {
    // Set current editing quiz ID
    editingQuizId = quizData ? quizData.id : null;
    
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
    editingQuizId = null;
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
    const isEdit = !!editingQuizId;
    
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
    
    // Validate classroomId
    if (!classroomId || !isValidObjectId(classroomId)) {
        console.error('Invalid classroom ID for saving quiz:', classroomId);
        showNotification('Invalid classroom ID. Cannot save quiz.', 'error');
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
        ? `/api/classrooms/${classroomId}/quizzes/${editingQuizId}` 
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
            editingQuizId = data.quiz.id;
            
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
            const index = quizzes.findIndex(q => q.id === editingQuizId);
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
    
    // Validate classroomId
    if (!classroomId || !isValidObjectId(classroomId)) {
        console.error('Invalid classroom ID for loading quizzes:', classroomId);
        showNotification('Invalid classroom ID. Cannot load quizzes.', 'error');
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
    
    // Make sure we have quizzes to render
    if (!quizzes || !Array.isArray(quizzes)) {
        console.error('No valid quizzes array found');
        quizList.innerHTML = `
            <div class="no-quizzes">
                <p>No quizzes available. Click "Create New Quiz" to get started.</p>
            </div>
        `;
        return;
    }
    
    console.log('Rendering quizzes:', quizzes);
    
    // Update status for each quiz
    quizzes.forEach(quiz => {
        // Calculate endTime from startTime and duration if endTime is not provided
        const startTime = new Date(quiz.startTime);
        const endTime = quiz.endTime 
            ? new Date(quiz.endTime) 
            : new Date(startTime.getTime() + (quiz.duration * 1000)); // duration is in seconds
            
        quiz.status = getQuizStatus(startTime, endTime);
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
        // Handle MongoDB IDs - for quiz objects from MongoDB, the id might be in _id or id
        const quizId = quiz.id || quiz._id;
        
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
            const hasPaper = quiz.questionPaper && (quiz.questionPaper.filename || quiz.questionPaper.name);
            const hasAnswerKey = quiz.answerKey && (quiz.answerKey.filename || quiz.answerKey.name);
            
            quizMetaHTML += `
                <span class="quiz-type pdf"><i class="fas fa-file-pdf"></i> PDF Quiz</span>
                ${hasPaper ? `<span class="quiz-paper"><i class="fas fa-file-alt"></i> ${quiz.questionPaper.filename || quiz.questionPaper.name}</span>` : ''}
                ${hasAnswerKey ? `<span class="quiz-key"><i class="fas fa-key"></i> Answer Key</span>` : ''}
            `;
        } else {
            // Show question count for regular quizzes
            quizMetaHTML += `
                <span class="quiz-questions"><i class="fas fa-question-circle"></i> ${quiz.questions ? quiz.questions.length : 0} Question${quiz.questions && quiz.questions.length !== 1 ? 's' : ''}</span>
            `;
        }
        
        // Calculate submission count and stats
        let submissionInfo = '';
        
        // Handle both MongoDB nested submissions array and old submissionStats property
        if (quiz.submissions && Array.isArray(quiz.submissions)) {
            const totalCount = quiz.submissions.length;
            const gradedCount = quiz.submissions.filter(sub => sub.isGraded).length;
            
            submissionInfo = `
                <span class="submission-info">
                    <i class="fas fa-users"></i> 
                    ${totalCount} Submission${totalCount !== 1 ? 's' : ''} (${gradedCount} Graded)
                </span>
            `;
        } else if (quiz.submissionStats) {
            // Fallback to old structure if present
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
        
        // Calculate the quiz duration in a readable format
        const durationMinutes = quiz.duration ? Math.floor(quiz.duration / 60) : 0;
        const durationText = durationMinutes > 0 ? `${durationMinutes} minutes` : 'No time limit';
        
        // Create the quiz card
        quizList.insertAdjacentHTML('beforeend', `
            <div class="quiz-card ${isPdfQuiz ? 'pdf-quiz' : ''}" data-quiz-id="${quizId}">
                <div class="quiz-info">
                    <h3>${quiz.title}</h3>
                    <p class="quiz-description">${quiz.description || ''}</p>
                    <div class="quiz-meta">
                        ${quizMetaHTML}
                        <span class="duration"><i class="fas fa-clock"></i> ${durationText}</span>
                        ${submissionInfo}
                    </div>
                </div>
                <div class="quiz-actions">
                    ${quiz.status === 'published' || quiz.status === 'expired' ? 
                      `<button class="btn btn-primary view-results-btn" data-id="${quizId}">
                          <i class="fas fa-poll"></i> View Results
                      </button>` : ''}
                    
                    <div class="action-buttons">
                        ${downloadButtons}
                        <button class="btn btn-outline edit-quiz-btn" data-id="${quizId}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-outline delete-quiz-btn" data-id="${quizId}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `);
    });
    
    // Add event listeners to the newly created buttons
    document.querySelectorAll('.edit-quiz-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const quizId = e.currentTarget.getAttribute('data-id');
            editQuiz(quizId);
        });
    });
    
    document.querySelectorAll('.delete-quiz-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            if (confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
                const quizId = e.currentTarget.getAttribute('data-id');
                deleteQuiz(quizId);
            }
        });
    });
    
    document.querySelectorAll('.view-results-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const quizId = e.currentTarget.getAttribute('data-id');
            viewQuizResults(quizId);
        });
    });
    
    document.querySelectorAll('.download-paper-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const quizId = e.currentTarget.closest('.quiz-card').getAttribute('data-quiz-id');
            const quiz = quizzes.find(q => (q.id === quizId || q._id === quizId));
            if (quiz && quiz.questionPaper) {
                // Create a temp link to download the file
                const link = document.createElement('a');
                link.href = quiz.questionPaper.url || `/api/quizzes/${quizId}/download-paper`;
                link.target = '_blank';
                link.download = quiz.questionPaper.filename || quiz.questionPaper.name || 'question_paper.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        });
    });
    
    document.querySelectorAll('.download-key-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const quizId = e.currentTarget.closest('.quiz-card').getAttribute('data-quiz-id');
            const quiz = quizzes.find(q => (q.id === quizId || q._id === quizId));
            if (quiz && quiz.answerKey) {
                // Create a temp link to download the file
                const link = document.createElement('a');
                link.href = quiz.answerKey.url || `/api/quizzes/${quizId}/download-key`;
                link.target = '_blank';
                link.download = quiz.answerKey.filename || quiz.answerKey.name || 'answer_key.pdf';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
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
    // Redirect to the dedicated quiz results page
    window.location.href = `/teacher_quiz_results?classroomId=${classroomId}&quizId=${quizId}`;
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

// Add this function elsewhere in the file
function processAllQuizPdfs() {
    // Check for token first
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No access token found');
        showNotification('Authorization error: Please log in again', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
        return;
    }
    
    // Show a confirmation dialog
    if (!confirm('This will process all quiz PDFs in this classroom that haven\'t been processed yet. This may take some time. Continue?')) {
        return;
    }
    
    // Show processing notification
    showNotification('Processing quiz PDFs. This may take a few minutes...', 'info', 10000);
    
    // Disable the button and show loading state
    const btn = document.getElementById('process-pdfs-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    // Call API endpoint to process all PDFs in the classroom
    fetch(`/api/classrooms/${classroomId}/process-pdfs`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('Server response status:', response.status);
        
        // Check for authentication issues first
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed');
        }
        
        // Get the response as text first
        return response.text().then(text => {
            // Try to parse as JSON
            try {
                const data = JSON.parse(text);
                // Add status to the data for easier handling
                return { ...data, status: response.status, ok: response.ok };
            } catch (error) {
                // If it's not valid JSON, return the text with status
                console.error('Non-JSON response:', text);
                return { 
                    msg: 'Server returned non-JSON response', 
                    rawResponse: text.substring(0, 100), // First 100 chars only
                    status: response.status,
                    ok: false
                };
            }
        });
    })
    .then(data => {
        console.log('Server response data:', data);
        
        // Handle unsuccessful responses
        if (!data.ok) {
            throw new Error(data.msg || 'Error processing quiz PDFs');
        }
        
        // Show success message with details
        let message = data.msg || 'Processing complete';
        
        // If we have detailed stats, show them
        if (data.processed !== undefined) {
            message += `: ${data.processed} quiz PDFs processed, ${data.already_processed || 0} already processed, ${data.errors || 0} errors`;
        }
        
        showNotification(message, 'success', 8000);
        
        // Refresh quiz list to show updated data
        loadQuizzes();
    })
    .catch(error => {
        console.error('Error processing PDFs:', error);
        if (error.message === 'Authentication failed') {
            showNotification('Session expired. Please log in again.', 'error');
            setTimeout(() => {
                localStorage.removeItem('access_token');
                window.location.href = '/login';
            }, 2000);
        } else {
            showNotification(`Error: ${error.message}`, 'error');
        }
    })
    .finally(() => {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalText;
    });
}


function initializePerformanceDashboard() {
  console.log('Initializing performance dashboard');
  
  // Get classroom ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const classroomId = urlParams.get('classroomId');
  
  if (!classroomId) {
    console.error('No classroom ID found in URL');
    const dashboard = document.querySelector('.performance-dashboard');
    if (dashboard) {
      dashboard.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>No classroom ID found in URL. Please ensure you\'re accessing this page correctly.</p></div>';
    }
    return;
  }
  
  // Store original HTML for later restoration
  const dashboard = document.querySelector('.performance-dashboard');
  const originalHTML = dashboard ? dashboard.innerHTML : '';
  
  // Show loading state
  if (dashboard) {
    dashboard.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading performance data...</p></div>';
  }
  
  // Fetch student quiz data from API
  fetch(`/api/classrooms/${classroomId}/quizzes`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      console.error('API error status:', response.status);
      throw new Error(`Failed to fetch quiz data: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Raw quiz data received from API:', data);
    console.log('Data type:', typeof data);
    console.log('Is Array:', Array.isArray(data));
    console.log('Length:', data?.length || 0);
    
    // Verify required fields are present
    if (Array.isArray(data) && data.length > 0) {
      const sampleQuiz = data[0];
      console.log('Sample quiz object fields:', Object.keys(sampleQuiz));
      console.log('Has submissions:', sampleQuiz.hasOwnProperty('submissions'));
      if (sampleQuiz.submissions && sampleQuiz.submissions.length > 0) {
        console.log('Sample submission fields:', Object.keys(sampleQuiz.submissions[0]));
      }
    }
    
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.warn('No quiz data returned from API');
      if (dashboard) {
        dashboard.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><h3>No Performance Data</h3><p>There are no quizzes or student submissions yet for this classroom.</p></div>';
      }
      return;
    }
    
    // Process the raw data to calculate all needed metrics
    const processedData = processQuizData(data);
    console.log('Processed data:', processedData);
    
    // Restore original HTML structure before populating with data
    if (dashboard && originalHTML) {
      dashboard.innerHTML = originalHTML;
    }
    
    // Render the dashboard with the processed data
    renderPerformanceDashboard(processedData);
    
    // Setup section tab switching 
    setupSectionTabSwitching();
    
    // Set up export buttons
    const pdfBtn = document.getElementById('export-performance-pdf');
    const csvBtn = document.getElementById('export-performance-csv');
    const shareBtn = document.getElementById('share-performance-report');
    
    if (pdfBtn) pdfBtn.addEventListener('click', exportPerformanceToPDF);
    if (csvBtn) csvBtn.addEventListener('click', exportPerformanceToCSV);
    if (shareBtn) shareBtn.addEventListener('click', sharePerformanceReport);
  })
  .catch(error => {
    console.error('Error fetching or processing quiz data:', error);
    if (dashboard) {
      dashboard.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Data</h3><p>${error.message || 'Could not load performance data'}</p></div>`;
    }
  });
}

function renderPerformanceDashboard(data) {
  // Update summary cards with rounded values
  document.getElementById('class-average').textContent = `${Math.round(data.classAverage)}%`;
  document.getElementById('assignments-completed').textContent = data.completedAssignments || 0;
  document.getElementById('highest-score').textContent = `${Math.round(data.highestScore)}%`;
  document.getElementById('lowest-score').textContent = `${Math.round(data.lowestScore)}%`;
  
  // Update names
  document.getElementById('top-student-name').textContent = data.topStudent || '--';
  document.getElementById('struggling-student-name').textContent = data.strugglingStudent || '--';
  
  // Update trends
  const averageTrendElement = document.getElementById('class-average-trend');
  const averageTrend = data.averageTrend || 0;
  
  if (averageTrend > 0) {
    averageTrendElement.innerHTML = `<i class="fas fa-arrow-up"></i><span>+${averageTrend}%</span>`;
    averageTrendElement.style.color = '#34A853'; // Green for positive
  } else if (averageTrend < 0) {
    averageTrendElement.innerHTML = `<i class="fas fa-arrow-down"></i><span>${averageTrend}%</span>`;
    averageTrendElement.style.color = '#EA4335'; // Red for negative
  } else {
    averageTrendElement.innerHTML = `<i class="fas fa-minus"></i><span>0%</span>`;
    averageTrendElement.style.color = '#5f6368'; // Gray for no change
  }
  
  // Update completion rate
  const completionRateElement = document.getElementById('completion-rate');
  completionRateElement.innerHTML = `<i class="fas fa-users"></i><span>${Math.round(data.completionRate || 0)}%</span>`;
  
  // Log data for debugging
  console.log('Rendering performance dashboard with data:', data);
  
  // Render charts
  renderPerformanceTrendChart(data);
  renderScoreDistributionChart(data);
  
  // Render student rankings
  renderStudentRankings(data.students || []);
  
  // Set up assignment analysis
  if (data.assignments && data.assignments.length > 0) {
    renderAssignmentAnalysis(data.assignments);
    populateAssignmentInsights(data.assignments);
  } else {
    console.warn('No quiz data available for analysis');
    document.getElementById('assignmentAnalysisChart').parentElement.innerHTML = 
      '<div class="no-data-message">No quiz data available for analysis</div>';
  }
  
  // Set up improvement tracking
  if (data.improvement) {
    renderImprovementData(data.improvement);
    renderStudentProgressChart(data);
  } else {
    console.warn('No improvement data available');
  }
}

function renderPerformanceTrendChart(data) {
  const ctx = document.getElementById('performanceTrendChart').getContext('2d');
  
  // Set explicit canvas height
  ctx.canvas.height = 250;
  
  // Get trend data
  const trendData = data.performanceTrend || [];
  const labels = trendData.map(item => item.date);
  const averages = trendData.map(item => item.average);
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Class Average',
        data: averages,
        borderColor: '#4285F4',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#4285F4',
        pointRadius: 4,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: value => `${value}%`
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Average: ${context.parsed.y}%`;
            }
          }
        }
      }
    }
  });
}

function renderScoreDistributionChart(data) {
  const ctx = document.getElementById('scoreDistributionChart').getContext('2d');
  
  // Set explicit canvas height
  ctx.canvas.height = 250;
  
  // Add distribution view toggle if it doesn't exist
  let distributionToggle = document.getElementById('distribution-toggle');
  if (!distributionToggle) {
    const chartContainer = document.querySelector('.score-distribution-chart-container');
    if (chartContainer) {
      const toggleDiv = document.createElement('div');
      toggleDiv.className = 'distribution-toggle-container';
      toggleDiv.innerHTML = `
        <div class="toggle-label">View:</div>
        <select id="distribution-toggle" class="form-select form-select-sm">
          <option value="students">Student Averages</option>
          <option value="quizzes">Individual Quizzes</option>
        </select>
      `;
      chartContainer.insertBefore(toggleDiv, chartContainer.firstChild);
      distributionToggle = document.getElementById('distribution-toggle');
    }
  }
  
  // Function to render distribution based on selected view
  const renderDistribution = (view) => {
    // Reset distributions
    const distribution = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0
    };
    
    if (view === 'students') {
      // Use student average scores for distribution (one entry per student)
      const students = data.students || [];
      students.forEach(student => {
        const avgScore = student.averageScore;
        if (avgScore <= 20) distribution['0-20']++;
        else if (avgScore <= 40) distribution['21-40']++;
        else if (avgScore <= 60) distribution['41-60']++;
        else if (avgScore <= 80) distribution['61-80']++;
        else distribution['81-100']++;
      });
    } else {
      // Use all individual submission scores
      const allSubmissions = [];
      
      // Collect all individual quiz scores
      data.assignments.forEach(quiz => {
        // Find this quiz in the original data to get submissions
        const quizStudents = data.students.flatMap(student => 
          student.quizzes.filter(q => q.id === quiz.id)
            .map(q => ({ score: q.score }))
        );
        
        quizStudents.forEach(sub => {
          allSubmissions.push(sub.score);
        });
      });
      
      // Categorize all scores
      allSubmissions.forEach(score => {
        if (score <= 20) distribution['0-20']++;
        else if (score <= 40) distribution['21-40']++;
        else if (score <= 60) distribution['41-60']++;
        else if (score <= 80) distribution['61-80']++;
        else distribution['81-100']++;
      });
    }
    
    // Create or update chart
    if (window.scoreDistChart) {
      window.scoreDistChart.data.datasets[0].data = Object.values(distribution);
      window.scoreDistChart.update();
    } else {
      window.scoreDistChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
          datasets: [{
            label: view === 'students' ? 'Number of Students' : 'Number of Submissions',
            data: Object.values(distribution),
            backgroundColor: [
              'rgba(234, 67, 53, 0.7)',  // Red
              'rgba(251, 188, 5, 0.7)',  // Yellow
              'rgba(52, 168, 83, 0.7)',  // Green
              'rgba(66, 133, 244, 0.7)', // Blue
              'rgba(138, 78, 216, 0.7)'  // Purple
            ],
            borderColor: [
              'rgba(234, 67, 53, 1)',
              'rgba(251, 188, 5, 1)',
              'rgba(52, 168, 83, 1)',
              'rgba(66, 133, 244, 1)',
              'rgba(138, 78, 216, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                precision: 0
              }
            }
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function(context) {
                  const count = context.parsed.y;
                  const label = view === 'students' ? 'student' : 'submission';
                  return `${count} ${label}${count !== 1 ? 's' : ''}`;
                }
              }
            }
          }
        }
      });
    }
  };
  
  // Initial render with student view
  renderDistribution('students');
  
  // Add event listener to toggle if it exists
  if (distributionToggle) {
    // Remove existing listener first (to prevent duplicates)
    const newToggle = distributionToggle.cloneNode(true);
    distributionToggle.parentNode.replaceChild(newToggle, distributionToggle);
    
    // Add new listener
    newToggle.addEventListener('change', function() {
      renderDistribution(this.value);
    });
  }
}

function renderStudentRankings(students) {
  const tableBody = document.getElementById('rankings-table-body');
  tableBody.innerHTML = '';
  
  console.log('Rendering student rankings with data:', students);
  
  // If we have no students, show a message
  if (!students || students.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="no-data">No student data available</td></tr>';
    return;
  }
  
  // Create a row for each student
  students.forEach((student, index) => {
    const row = document.createElement('tr');
    
    // Create trend icon and color based on trend value
    let trendIcon, trendColor;
    if (student.trend > 0) {
      trendIcon = 'fa-arrow-up';
      trendColor = '#34A853'; // Green
    } else if (student.trend < 0) {
      trendIcon = 'fa-arrow-down';
      trendColor = '#EA4335'; // Red
    } else {
      trendIcon = 'fa-minus';
      trendColor = '#5f6368'; // Gray
    }
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="student-info">
          <img src="${student.avatar || '/images/image.png'}" class="student-avatar" alt="${student.name}">
          <span>${student.name}</span>
        </div>
      </td>
      <td>${Math.round(student.averageScore)}%</td>
      <td>${student.completed}/${student.total}</td>
      <td style="color: ${trendColor}">
        <i class="fas ${trendIcon}"></i> ${Math.abs(student.trend)}%
      </td>
      <td>
        <button class="btn btn-sm btn-outline view-detail-btn" data-student-id="${student.id}">
          View Detail
        </button>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
  
  // Add event listeners to the view detail buttons
  document.querySelectorAll('.view-detail-btn').forEach(button => {
    button.addEventListener('click', function() {
      const studentId = this.getAttribute('data-student-id');
      console.log(`View details for student ${studentId}`);
      // This would open a detailed view of the student's performance
      showNotification('Student detail view coming soon', 'info');
    });
  });
}

function renderAssignmentAnalysis(assignments) {
  // Update function name and terminology to use "quizzes" instead of "assignments"
  const ctx = document.getElementById('assignmentAnalysisChart').getContext('2d');
  
  // Set explicit canvas height
  ctx.canvas.height = 250;
  
  // Get assignment names and averages
  const names = assignments.map(a => a.title);
  const averages = assignments.map(a => a.average);
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{
        label: 'Quiz Average (%)',
        data: averages,
        backgroundColor: 'rgba(66, 133, 244, 0.6)',
        borderColor: 'rgba(66, 133, 244, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: value => `${value}%`
          }
        }
      }
    }
  });
}

function populateAssignmentInsights(assignments) {
  // Update function to populate quiz insights instead of assignment insights
  if (!assignments || assignments.length === 0) {
    document.getElementById('difficult-topics-list').innerHTML = '<li>No quiz data available</li>';
    document.getElementById('strong-topics-list').innerHTML = '<li>No quiz data available</li>';
    return;
  }
  
  // Sort by average scores
  const sortedByDifficulty = [...assignments].sort((a, b) => a.average - b.average);
  const sortedByStrength = [...assignments].sort((a, b) => b.average - a.average);
  
  // Get the 3 most difficult quizzes (or fewer if not enough data)
  const difficultQuizzes = sortedByDifficulty.slice(0, Math.min(3, sortedByDifficulty.length));
  const difficultList = document.getElementById('difficult-topics-list');
  difficultList.innerHTML = '';
  
  difficultQuizzes.forEach(quiz => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${quiz.title}</strong>: ${Math.round(quiz.average)}% average`;
    difficultList.appendChild(li);
  });
  
  // Get the 3 strongest quizzes (or fewer if not enough data)
  const strongQuizzes = sortedByStrength.slice(0, Math.min(3, sortedByStrength.length));
  const strongList = document.getElementById('strong-topics-list');
  strongList.innerHTML = '';
  
  strongQuizzes.forEach(quiz => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${quiz.title}</strong>: ${Math.round(quiz.average)}% average`;
    strongList.appendChild(li);
  });
}

function renderImprovementData(improvement) {
  // Update improvement metrics in the UI using actual data
  document.getElementById('most-improved-percent').textContent = `${improvement.mostImprovedPercent || 0}%`;
  document.getElementById('most-improved-student').textContent = improvement.mostImprovedStudent || '--';
  document.getElementById('class-improvement').textContent = `${improvement.classImprovement || 0}%`;
  document.getElementById('students-improving-count').textContent = improvement.studentsImproving || 0;
  document.getElementById('students-improving-percent').textContent = `${improvement.studentsImprovingPercent || 0}%`;
  
  console.log('Rendered improvement data:', improvement);
}

function renderStudentProgressChart(data) {
  const ctx = document.getElementById('studentProgressChart').getContext('2d');
  
  // Set explicit canvas height
  ctx.canvas.height = 250;
  
  // Get all students
  const students = data.students || [];
  
  if (students.length === 0) {
    console.error('No student data available for progress chart');
    return;
  }
  
  // Process labels and data
  const labels = data.progressLabels || [];
  const averageData = data.averageProgress || [];
  
  // Populate student selector dropdown
  const studentSelect = document.getElementById('student-progress-select');
  studentSelect.innerHTML = '<option value="all">All Students (Average)</option>';
  
  students.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.name;
    studentSelect.appendChild(option);
  });
  
  // Create the initial chart with average data
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Class Average',
        data: averageData,
        borderColor: 'rgba(66, 133, 244, 1)',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Score (%)'
          },
          ticks: {
            callback: value => `${value}%`
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Score: ${context.parsed.y}%`;
            }
          }
        }
      }
    }
  });
  
  // Add event listener to the student selector
  studentSelect.addEventListener('change', function() {
    const selectedId = this.value;
    
    // If "all" selected, show class average
    if (selectedId === 'all') {
      chart.data.datasets = [{
        label: 'Class Average',
        data: averageData,
        borderColor: 'rgba(66, 133, 244, 1)',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }];
      chart.update();
      return;
    }
    
    // Find selected student
    const selectedStudent = students.find(s => s.id === selectedId);
    if (!selectedStudent) return;
    
    // Map student quizzes to the correct format for the chart
    // Create a map of quiz scores indexed by quiz title
    const quizScoreMap = {};
    
    if (selectedStudent.quizzes && selectedStudent.quizzes.length) {
      selectedStudent.quizzes.forEach(quiz => {
        quizScoreMap[quiz.title] = quiz.score;
      });
    }
    
    // Map student scores to chart data points, matching the labels
    const studentData = labels.map(quizTitle => {
      return quizScoreMap[quizTitle] !== undefined ? quizScoreMap[quizTitle] : null;
    });
    
    // Update chart with student data
    chart.data.datasets = [{
      label: selectedStudent.name,
      data: studentData,
      borderColor: 'rgba(234, 67, 53, 1)',
      backgroundColor: 'rgba(234, 67, 53, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    }];
    
    chart.update();
  });
}

function exportPerformanceToPDF() {
  showNotification('Exporting performance report as PDF...', 'info');
  // In a real implementation, this would generate and download a PDF
  setTimeout(() => {
    showNotification('Performance report exported successfully!', 'success');
  }, 1500);
}

function exportPerformanceToCSV() {
  showNotification('Exporting performance data as CSV...', 'info');
  // In a real implementation, this would generate and download a CSV
  setTimeout(() => {
    showNotification('Performance data exported successfully!', 'success');
  }, 1500);
}

function sharePerformanceReport() {
  showNotification('Preparing to share performance report...', 'info');
  // In a real implementation, this would open a sharing dialog
  setTimeout(() => {
    showNotification('Share link copied to clipboard!', 'success');
  }, 1500);
}

// Process raw quiz data to calculate all needed metrics
function processQuizData(data) {
  console.log('Processing quiz data to calculate metrics from scratch');
  
  // Initialize data structure for processed results
  const processedData = {
    classAverage: 0,
    completedAssignments: 0,
    highestScore: 0,
    lowestScore: 100,
    topStudent: '',
    strugglingStudent: '',
    averageTrend: 0,
    completionRate: 0,
    performanceTrend: [],
    scoreDistribution: {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0
    },
    students: [],
    assignments: [],
    improvement: {
      mostImprovedPercent: 0,
      mostImprovedStudent: '',
      classImprovement: 0,
      studentsImproving: 0,
      studentsImprovingPercent: 0
    },
    progressLabels: [],
    averageProgress: []
  };
  
  // If no data or no quizzes, return empty processed data
  if (!data || !data.length) {
    console.warn('No quiz data to process');
    return processedData;
  }
  
  // Count completed quizzes (quizzes with graded submissions)
  processedData.completedAssignments = data.filter(quiz => 
    quiz.submissions && quiz.submissions.some(sub => sub.isGraded === true)
  ).length;
  
  // Map to track student performance
  const studentMap = new Map();
  
  // Arrays to track all scores for overall class statistics
  const allScores = [];
  const allPercentages = [];
  
  // Process each quiz and its submissions
  data.forEach(quiz => {
    // Skip quizzes without submissions
    if (!quiz.submissions || !quiz.submissions.length) return;
    
    const quizTitle = quiz.title || `Quiz ${quiz.id}`;
    const quizId = quiz.id;
    const quizMaxScore = 100; // Default percentage max
    
    // Arrays for this quiz's scores and percentages
    const quizScores = [];
    const quizPercentages = [];
    
    // Process student submissions
    quiz.submissions.forEach(submission => {
      // Skip ungraded submissions for performance metrics
      if (!submission.isGraded) return;
      
      // Get student ID and name
      const studentId = submission.student_id;
      const studentName = submission.studentName || `Student ${studentId}`;
      
      // Calculate score and percentage
      const score = submission.score || 0;
      const maxScore = submission.maxScore || 100;
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      
      // Add to quiz scores
      quizScores.push(score);
      quizPercentages.push(percentage);
      
      // Add to all scores for overall stats
      allScores.push(score);
      allPercentages.push(percentage);
      
      // Update score distribution
      if (percentage <= 20) processedData.scoreDistribution['0-20']++;
      else if (percentage <= 40) processedData.scoreDistribution['21-40']++;
      else if (percentage <= 60) processedData.scoreDistribution['41-60']++;
      else if (percentage <= 80) processedData.scoreDistribution['61-80']++;
      else processedData.scoreDistribution['81-100']++;
      
      // Track highest and lowest scores
      if (percentage > processedData.highestScore) {
        processedData.highestScore = percentage;
        processedData.topStudent = studentName;
      }
      
      if (percentage < processedData.lowestScore || processedData.lowestScore === 100) {
        processedData.lowestScore = percentage;
        processedData.strugglingStudent = studentName;
      }
      
      // Update student tracking
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          id: studentId,
          name: studentName,
          avatar: '/images/image.png',
          scores: [],
          quizzes: [],
          completed: 0,
          total: data.length, // Total quizzes available
          averageScore: 0,
          trend: 0
        });
      }
      
      const studentData = studentMap.get(studentId);
      studentData.scores.push(percentage);
      studentData.quizzes.push({
        id: quizId,
        title: quizTitle,
        score: percentage
      });
      studentData.completed++;
    });
    
    // Calculate quiz average (only for graded submissions)
    const quizAverage = quizPercentages.length > 0 ? 
      quizPercentages.reduce((sum, p) => sum + p, 0) / quizPercentages.length : 0;
    
    // Add to assignments array for assignment analysis
    processedData.assignments.push({
      id: quizId,
      title: quizTitle,
      average: Math.round(quizAverage),
      maxScore: quizMaxScore
    });
    
    // Add to performance trend directly - one point per quiz
    processedData.performanceTrend.push({
      date: quizTitle, // Using quiz title as the label
      average: Math.round(quizAverage)
    });
  });
  
  // Calculate overall class average from all percentages
  processedData.classAverage = allPercentages.length > 0 ? 
    allPercentages.reduce((sum, p) => sum + p, 0) / allPercentages.length : 0;
  
  // Calculate completion rate (avg percentage of quizzes completed by students)
  const studentCount = studentMap.size;
  if (studentCount > 0 && data.length > 0) {
    const totalCompletionRate = Array.from(studentMap.values())
      .reduce((sum, student) => sum + (student.completed / student.total), 0);
    processedData.completionRate = (totalCompletionRate / studentCount) * 100;
  }
  
  // Process student data to calculate averages and trends
  studentMap.forEach(student => {
    // Calculate student's average score
    if (student.scores.length > 0) {
      student.averageScore = student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length;
    
      // Calculate trend (improvement from first to last quiz)
      if (student.scores.length >= 2) {
        const firstScores = student.scores.slice(0, Math.ceil(student.scores.length / 2));
        const lastScores = student.scores.slice(-Math.ceil(student.scores.length / 2));
        
        const firstAvg = firstScores.reduce((sum, score) => sum + score, 0) / firstScores.length;
        const lastAvg = lastScores.reduce((sum, score) => sum + score, 0) / lastScores.length;
        
        student.trend = Math.round(lastAvg - firstAvg);
      }
    }
    
    // Add to processed students array
    processedData.students.push(student);
  });
  
  // Sort students by average score
  processedData.students.sort((a, b) => b.averageScore - a.averageScore);
  
  // Find highest and lowest scoring students after calculating their averages
  if (processedData.students.length > 0) {
    // Find student with highest average score
    const topStudent = processedData.students[0];
    processedData.highestScore = Math.round(topStudent.averageScore);
    processedData.topStudent = topStudent.name;
    
    // Find student with lowest average score
    const strugglingStudent = processedData.students[processedData.students.length - 1];
    processedData.lowestScore = Math.round(strugglingStudent.averageScore);
    processedData.strugglingStudent = strugglingStudent.name;
  }
  
  // Use quiz titles for progress labels (same as trend data) 
  processedData.progressLabels = processedData.performanceTrend.map(item => item.date);
  processedData.averageProgress = processedData.performanceTrend.map(item => item.average);
  
  // Calculate improvement metrics
  if (processedData.students.length > 0) {
    // Find most improved student
    const mostImprovedStudent = [...processedData.students].sort((a, b) => b.trend - a.trend)[0];
    if (mostImprovedStudent && mostImprovedStudent.trend > 0) {
      processedData.improvement.mostImprovedPercent = mostImprovedStudent.trend;
      processedData.improvement.mostImprovedStudent = mostImprovedStudent.name;
    }
    
    // Count students with positive improvement
    const improvingStudents = processedData.students.filter(s => s.trend > 0);
    processedData.improvement.studentsImproving = improvingStudents.length;
    processedData.improvement.studentsImprovingPercent = Math.round((improvingStudents.length / processedData.students.length) * 100);
    
    // Calculate overall class improvement
    if (processedData.performanceTrend.length >= 2) {
      const firstAvg = processedData.performanceTrend[0].average;
      const lastAvg = processedData.performanceTrend[processedData.performanceTrend.length - 1].average;
      processedData.improvement.classImprovement = Math.round(lastAvg - firstAvg);
      processedData.averageTrend = processedData.improvement.classImprovement;
    }
  }
  
  console.log('Processed data:', processedData);
  return processedData;
}

function setupSectionTabSwitching() {
  console.log('Setting up section tab switching');
  
  // Get all section tabs
  const sectionTabs = document.querySelectorAll('.section-tab');
  
  if (sectionTabs.length === 0) {
    console.error('No section tabs found!');
    return;
  }
  
  console.log(`Found ${sectionTabs.length} section tabs`);
  
  // Remove any existing event listeners (to prevent duplicates)
  sectionTabs.forEach(tab => {
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
  });
  
  // Add event listeners to each tab
  document.querySelectorAll('.section-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      console.log(`Section tab clicked: ${tab.getAttribute('data-section')}`);
      
      // Remove active class from all tabs and content
      document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const sectionId = tab.getAttribute('data-section');
      const contentElement = document.getElementById(sectionId);
      
      if (contentElement) {
        contentElement.classList.add('active');
      } else {
        console.error(`Section content with ID ${sectionId} not found!`);
      }
    });
  });
}

function isValidObjectId(id) {
    if (!id || id === 'null' || id === 'undefined') {
        return false;
    }
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    return objectIdPattern.test(id);
}
