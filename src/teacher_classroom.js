document.getElementById('hamburger').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('expanded');
});

document.querySelector('.profile-icon').addEventListener('click', function() {
    document.querySelector('.profile-dropdown').classList.toggle('show');
});

document.addEventListener('click', function(event) {
    if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
      document.querySelector('.profile-dropdown').classList.remove('show');
    }
});

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

const urlParams = new URLSearchParams(window.location.search);
const classroomId = urlParams.get('classroomId');
if (!classroomId) {
  alert('Classroom ID not provided in URL');
}

let teacherNameGlobal = "";
let teacherAvatarGlobal = "https://i.pravatar.cc/40";
let announcementAttachments = [];
let announcementImages = [];
let draftAnnouncements = {};

document.addEventListener('DOMContentLoaded', function() {
    const markdownScript = document.createElement('script');
    markdownScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js';
    document.head.appendChild(markdownScript);
    initializeComposer();
    loadDrafts();
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
      tab.addEventListener('click', function() {
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
      composerTextarea.addEventListener('input', function() {
        postBtn.disabled = this.value.trim() === '';
        if (this.value.trim() !== '') {
          autosaveDraft(this.value);
        }
      });
      composerTextarea.addEventListener('keyup', function() {
        if (document.querySelector('.preview-mode').classList.contains('active')) {
          updateMarkdownPreview();
        }
      });
    }
    const attachBtn = document.querySelector('.announcement-composer .attach-btn');
    const attachmentInput = document.getElementById('attachment-file-input');
    if (attachBtn && attachmentInput) {
      attachBtn.addEventListener('click', function() {
        attachmentInput.click();
      });
      attachmentInput.addEventListener('change', function() {
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
      imageBtn.addEventListener('click', function() {
        imageInput.click();
      });
      imageInput.addEventListener('change', function() {
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
      scheduleBtn.addEventListener('click', function() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('schedule-date').valueAsDate = tomorrow;
        document.getElementById('schedule-time').value = new Date().toTimeString().slice(0, 5);
        document.querySelector('.schedule-modal').style.display = 'flex';
      });
    }
    document.querySelector('.cancel-schedule-btn')?.addEventListener('click', function() {
      document.querySelector('.schedule-modal').style.display = 'none';
    });
    document.querySelector('.confirm-schedule-btn')?.addEventListener('click', function() {
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
    document.querySelector('.save-draft-btn')?.addEventListener('click', function() {
      saveDraft();
    });
    if (postBtn) {
      postBtn.addEventListener('click', function() {
        const text = composerTextarea.value.trim();
        if (!text) return;
        const token = localStorage.getItem('access_token');
        if (!token) {
          alert('You are not authenticated. Please log in.');
          return;
        }
        const scheduledTime = this.getAttribute('data-scheduled');
        const formattedAttachments = announcementAttachments.map(att => ({
          name: att.name,
          url: att.url
        }));
        const formattedImages = announcementImages.map(img => ({
          url: img.url
        }));
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
            postBtn.disabled = true;
            announcementAttachments = [];
            announcementImages = [];
            document.querySelector('.images-preview').innerHTML = '';
            document.querySelector('.files-preview').innerHTML = '';
            postBtn.textContent = 'Post';
            postBtn.removeAttribute('data-scheduled');
            const scheduleIndicator = document.querySelector('.schedule-indicator');
            if (scheduleIndicator) scheduleIndicator.remove();
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
}

function updateMarkdownPreview() {
    const text = document.querySelector('.announcement-composer textarea').value;
    const previewElement = document.querySelector('.markdown-preview');
    if (typeof marked !== 'undefined') {
      previewElement.innerHTML = marked.parse(text);
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
      button.addEventListener('click', function() {
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
      button.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        announcementImages.splice(index, 1);
        renderImagePreviews();
      });
    });
}

function renderNewAnnouncement(announcement) {
    const attHtml = announcement.attachments && announcement.attachments.length ? `<div class="attachments">
      ${announcement.attachments.map(att => `<a href="${att.url}" target="_blank" class="attachment-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        ${att.name}
      </a>`).join(' ')}
    </div>` : '';
    const imgHtml = announcement.images && announcement.images.length ? `<div class="images">
      ${announcement.images.map(img => `<a href="${img.url}" target="_blank" class="image-link">
        <img src="${img.url}" alt="Image" class="announcement-image">
      </a>`).join(' ')}
    </div>` : '';
    let announcementText = announcement.text;
    if (typeof marked !== 'undefined') {
      announcementText = marked.parse(announcement.text);
    }
    const newAnnouncementHTML = `<div class="announcement-card" data-id="${announcement.announcement_id}">
      <div class="announcement-header">
        <img src="${teacherAvatarGlobal}" alt="Profile" class="profile-pic">
        <div class="poster-info">
          <span class="poster-name">${teacherNameGlobal}</span>
          <span class="post-time">${new Date(announcement.postTime).toLocaleString()}</span>
        </div>
        <div class="announcement-actions">
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      </div>
      <div class="announcement-content">
        <div class="markdown-content">${announcementText}</div>
        ${attHtml}
        ${imgHtml}
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
    </div>`;
    const feed = document.querySelector('.announcements-feed');
    feed.insertAdjacentHTML('afterbegin', newAnnouncementHTML);
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
      document.querySelector('.classroom-header h1').textContent = data.className || "Course Name";
      document.querySelector('.classroom-header p').textContent = `${data.section || "Section"} - ${data.subject || "Subject"}`;
      document.getElementById('teacher-name').textContent = teacherNameGlobal;
      const feed = document.querySelector('.announcements-feed');
      feed.innerHTML = '';
      data.announcements.forEach(ann => {
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
        const imgHtml = ann.images && ann.images.length ? `<div class="images">
          ${ann.images.map(img => `<a href="${img.url}" target="_blank" class="image-link">
            <img src="${img.url}" alt="Image" class="announcement-image">
          </a>`).join(' ')}
        </div>` : '';
        const annHtml = `<div class="announcement-card" data-id="${ann.announcement_id}">
          <div class="announcement-header">
            <img src="${teacherAvatarGlobal}" alt="Profile" class="profile-pic">
            <div class="poster-info">
              <span class="poster-name">${teacherNameGlobal}</span>
              <span class="post-time">${new Date(ann.postTime).toLocaleString()}</span>
            </div>
            <div class="announcement-actions">
              <button class="edit-btn">Edit</button>
              <button class="delete-btn">Delete</button>
            </div>
          </div>
          <div class="announcement-content">
            <div class="markdown-content">${announcementText}</div>
            ${attHtml}
            ${imgHtml}
          </div>
          <div class="announcement-footer">
            <button class="comment-btn">Add class comment</button>
          </div>
          <div class="comments-section">
            <div class="comments-list">
              ${ann.comments.map(comment => `
                <div class="comment">
                  <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
                  <div class="comment-info">
                    <span class="commenter-name">${comment.commenterName}</span>
                    <p>${comment.text}</p>
                    <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="comment-input" style="display:none;">
              <textarea placeholder="Add a comment..."></textarea>
              <button class="post-comment-btn">Post</button>
            </div>
          </div>
        </div>`;
        feed.insertAdjacentHTML('beforeend', annHtml);
      });
    })
    .catch(err => console.error(err));
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
    localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
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
}

function loadDrafts() {
    const savedDrafts = localStorage.getItem('announcement_drafts');
    if (savedDrafts) {
      draftAnnouncements = JSON.parse(savedDrafts);
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
      btn.addEventListener('click', function() {
        const draftId = this.getAttribute('data-id');
        loadDraftContent(draftId);
        document.querySelector('.drafts-modal').style.display = 'none';
      });
    });
    document.querySelectorAll('.delete-draft-btn').forEach(btn => {
      btn.addEventListener('click', function() {
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
    }
}

function clearDraft() {
    if (draftAnnouncements['autosave_draft']) {
      delete draftAnnouncements['autosave_draft'];
      localStorage.setItem('announcement_drafts', JSON.stringify(draftAnnouncements));
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
    `;
    const textareaContainer = document.querySelector('.write-mode');
    if (textareaContainer) {
      textareaContainer.insertBefore(composerToolbar, textareaContainer.firstChild);
      document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', function() {
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
          replacement = selectedText.split('\n').map((line, i) => `${i+1}. ${line}`).join('\n');
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

document.addEventListener('click', function(event) {
    if (event.target.classList.contains('comment-btn')) {
      const commentSection = event.target.closest('.announcement-card').querySelector('.comment-input');
      commentSection.style.display = commentSection.style.display === 'none' ? 'flex' : 'none';
    }
    if (event.target.classList.contains('post-comment-btn')) {
      const commentInput = event.target.previousElementSibling;
      const text = commentInput.value.trim();
      if (text) {
        const commentsList = event.target.closest('.comments-section').querySelector('.comments-list');
        const announcementId = event.target.closest('.announcement-card').getAttribute('data-id');
        const commentHtml = `
          <div class="comment">
            <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
            <div class="comment-info">
              <span class="commenter-name">You</span>
              <p>${text}</p>
              <span class="comment-time">${new Date().toLocaleString()}</span>
            </div>
          </div>
        `;
        commentsList.insertAdjacentHTML('beforeend', commentHtml);
        commentInput.value = '';
      }
    }
    if (event.target.classList.contains('edit-btn')) {
      const announcementCard = event.target.closest('.announcement-card');
      const announcementContent = announcementCard.querySelector('.markdown-content').innerHTML;
      const announcementId = announcementCard.getAttribute('data-id');
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
    if (event.target.classList.contains('delete-btn')) {
      if (confirm('Are you sure you want to delete this announcement?')) {
        const announcementCard = event.target.closest('.announcement-card');
        const announcementId = announcementCard.getAttribute('data-id');
        announcementCard.remove();
      }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    setupDragAndDrop();
    const draftBtn = document.createElement('button');
    draftBtn.className = 'draft-list-btn';
    draftBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      My Drafts
    `;
    document.querySelector('.composer-actions').prepend(draftBtn);
    draftBtn.addEventListener('click', function() {
      loadDraftsList();
      document.querySelector('.drafts-modal').style.display = 'flex';
    });
    document.querySelector('.close-drafts-btn')?.addEventListener('click', function() {
      document.querySelector('.drafts-modal').style.display = 'none';
    });
    addMarkdownToolbar();
});

  
  // Initial load
  loadClassroomData();
  
  // Add CSS for new features
  const newStyles = document.createElement('style');
newStyles.textContent = `
    /* Enhanced styles for composer */
    .composer-body {
      transition: all 0.3s ease;
      border-radius: 8px;
      position: relative;
    }
    
    .highlight-drop {
      background-color: rgba(0, 120, 212, 0.1);
      border: 2px dashed #0078d4;
    }
    
    .composer-tabs {
      display: flex;
      border-bottom: 1px solid #e0e0e0;
      margin-bottom: 10px;
    }
    
    .composer-tab {
      background: none;
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      font-weight: 500;
      color: #555;
      position: relative;
    }
    
    .composer-tab.active {
      color: #0078d4;
    }
    
    .composer-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background-color: #0078d4;
    }
    
    .write-mode, .preview-mode {
      display: none;
      padding: 10px 0;
    }
    
    .write-mode.active, .preview-mode.active {
      display: block;
    }
    
    /* Markdown preview styling */
    .markdown-preview {
      min-height: 100px;
      padding: 8px;
      border-radius: 4px;
      background-color: #f9f9f9;
    }
    
    .markdown-preview h1 {
      font-size: 1.5em;
      margin-top: 0.5em;
      margin-bottom: 0.5em;
    }
    
    .markdown-preview h2 {
      font-size: 1.3em;
      margin-top: 0.5em;
      margin-bottom: 0.5em;
    }
    
    .markdown-preview h3 {
      font-size: 1.1em;
      margin-top: 0.5em;
      margin-bottom: 0.5em;
    }
    
    .markdown-preview ul, .markdown-preview ol {
      padding-left: 2em;
      margin: 0.5em 0;
    }
    
    .markdown-preview blockquote {
      border-left: 3px solid #e0e0e0;
      padding-left: 1em;
      margin: 0.5em 0;
      color: #555;
    }
    
    .markdown-preview code {
      background-color: #f0f0f0;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    
    .markdown-preview pre {
      background-color: #f0f0f0;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: monospace;
    }
    
    /* Markdown toolbar */
    .markdown-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      padding: 5px 0;
      border-bottom: 1px solid #e0e0e0;
      margin-bottom: 5px;
    }
    
    .toolbar-btn {
      background: none;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      transition: all 0.2s ease;
    }
    
    .toolbar-btn:hover {
      background-color: #f0f0f0;
      color: #0078d4;
    }
    
    /* Image and file previews */
    .attachment-preview-area {
      margin-top: 10px;
    }
    
    .images-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .image-card {
      position: relative;
      width: 150px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    .image-preview-container {
      width: 150px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f0f0f0;
      overflow: hidden;
    }
    
    .image-preview-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .image-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 8px;
      background-color: #f8f8f8;
    }
    
    .image-name {
      font-size: 0.8em;
      color: #555;
    }
    
    .remove-image-btn, .remove-file-btn {
      background: none;
      border: none;
      color: #ff4d4d;
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .files-preview {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .file-card {
      display: flex;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      background-color: #f8f8f8;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .file-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 10px;
      color: #0078d4;
    }
    
    .file-info {
      flex-grow: 1;
    }
    
    .file-name {
      font-weight: 500;
      margin-bottom: 2px;
    }
    
    .file-size {
      font-size: 0.8em;
      color: #777;
    }
    
    /* Modals */
    .schedule-modal, .drafts-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .schedule-modal-content, .drafts-modal-content {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    
    .schedule-form {
      display: flex;
      flex-direction: column;
      gap: 15px;
      margin: 20px 0;
    }
    
    .schedule-form label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .schedule-form input {
      padding: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }
    
    .schedule-actions, .drafts-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    
    .cancel-schedule-btn, .close-drafts-btn {
      background-color: #f0f0f0;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .confirm-schedule-btn {
      background-color: #0078d4;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    /* Drafts styling */
    .drafts-list {
      max-height: 400px;
      overflow-y: auto;
      margin: 15px 0;
    }
    
    .draft-card {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
      align-items: center;
    }
    
    .draft-preview {
      flex-grow: 1;
    }
    
    .draft-preview p {
      margin: 0 0 5px 0;
      color: #333;
    }
    
    .draft-date {
      font-size: 0.8em;
      color: #777;
    }
    
    .draft-actions {
      display: flex;
      gap: 5px;
    }
    
    .use-draft-btn, .delete-draft-btn {
      background: none;
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      border-radius: 4px;
    }
    
    .use-draft-btn {
      color: #0078d4;
    }
    
    .delete-draft-btn {
      color: #ff4d4d;
    }
    
    /* Drag and drop styling */
    .drag-over {
      background-color: rgba(0, 120, 212, 0.1);
      border: 2px dashed #0078d4;
    }
    
    /* Schedule indicator */
    .schedule-indicator {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 8px;
      background-color: #f0f8ff;
      border-radius: 4px;
      color: #0078d4;
      font-size: 0.9em;
      margin-right: auto;
    }
    
    /* Comment section styling */
    .comments-section {
      margin-top: 15px;
      border-top: 1px solid #e0e0e0;
      padding-top: 10px;
    }
    
    .comment {
      display: flex;
      margin-bottom: 10px;
      padding: 8px;
      border-radius: 8px;
      background-color: #f9f9f9;
    }
    
    .comment .profile-pic {
      margin-right: 10px;
      width: 32px;
      height: 32px;
    }
    
    .comment-info {
      flex-grow: 1;
    }
    
    .commenter-name {
      font-weight: 500;
      margin-right: 5px;
    }
    
    .comment-time {
      font-size: 0.8em;
      color: #777;
    }
    
    .comment-input {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .comment-input textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      resize: vertical;
      min-height: 60px;
    }
    
    .post-comment-btn {
      align-self: flex-end;
      background-color: #0078d4;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .markdown-toolbar {
        gap: 2px;
      }
      
      .toolbar-btn {
        padding: 3px 6px;
        font-size: 0.9em;
      }
      
      .image-card {
        width: 120px;
      }
      
      .image-preview-container {
        width: 120px;
        height: 80px;
      }
      
      .schedule-modal-content, .drafts-modal-content {
        width: 95%;
        padding: 15px;
      }
    }
    
    /* Accessibility improvements */
    .toolbar-btn:focus, .post-btn:focus, .composer-tab:focus {
      outline: 2px solid #0078d4;
      outline-offset: 2px;
    }
    
    .composer-body:focus-within {
      border-color: #0078d4;
    }
    
    /* Animation for modals */
    .schedule-modal, .drafts-modal {
      transition: opacity 0.3s ease;
    }
    
    /* Dark mode support (if implemented in the application) */
    @media (prefers-color-scheme: dark) {
      .markdown-preview {
        background-color: #2a2a2a;
        color: #f0f0f0;
      }
      
      .markdown-preview code, .markdown-preview pre {
        background-color: #333;
      }
      
      .file-card, .comment {
        background-color: #2a2a2a;
      }
      
      .draft-card:hover {
        background-color: #333;
      }
    }
`;
document.head.appendChild(newStyles);
