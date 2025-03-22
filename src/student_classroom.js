document.addEventListener('DOMContentLoaded', function () {
  // Global variables
  let classroomId;
  let teacherNameGlobal;
  let teacherAvatarGlobal = 'https://i.pravatar.cc/40';

  // Initialize MathJax for LaTeX support
  if (window.MathJax) {
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']]
      },
      svg: {
        fontCache: 'global'
      }
    };
  }

  // Basic UI functionality
  // Toggle sidebar
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  hamburger.addEventListener('click', function () {
    sidebar.classList.toggle('expanded');
  });

  // Profile dropdown
  const profileIcon = document.querySelector('.profile-icon');
  const profileDropdown = document.querySelector('.profile-dropdown');
  profileIcon.addEventListener('click', function (event) {
    event.stopPropagation();
    profileDropdown.classList.toggle('show');
  });
  document.addEventListener('click', function () {
    profileDropdown.classList.remove('show');
  });

  // Tab switching
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

  // Extract classroom ID from URL parameters
  function getClassroomIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('classId');
    if (!id) {
      showNotification('No classroom ID provided in the URL.', 'error');
      return null;
    }
    return id;
  }

  // Initialize classroom data
  function init() {
    classroomId = getClassroomIdFromUrl();
    if (classroomId) {
      loadClassroomData();
    } else {
      document.querySelector('.classroom-header h1').textContent = 'Classroom Not Found';
      document.querySelector('.classroom-header p').textContent = 'Please go back to the dashboard and select a classroom.';
    }
  }

  // Load classroom data
  function loadClassroomData() {
    const token = localStorage.getItem('access_token');
    if (!token) {
      showNotification('You are not authenticated. Please log in.', 'error');
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
        
        // Add controls for search and sort
        const feed = document.querySelector('.announcements-feed');
        
        // Store announcements in a global variable for sorting/filtering
        window.allAnnouncements = data.announcements || [];
        
        // Sort announcements by default (newest first)
        sortAnnouncementsByDate('newest');

        // Load assignments if available
        if (data.assignments && data.assignments.length > 0) {
          loadAssignments(data.assignments);
        }

        // Load quizzes if available
        if (data.quizzes && data.quizzes.length > 0) {
          loadQuizzes(data.quizzes);
        }

        // Load student performance if available
        if (data.performance) {
          loadPerformanceData(data.performance);
        }

        // Load resources if available
        if (data.resources && data.resources.length > 0) {
          loadResources(data.resources);
        }
      })
      .catch(err => {
        console.error(err);
        showNotification('Error loading classroom data.', 'error');
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
    if (sortedAnnouncements.length === 0) {
      feed.innerHTML = '<div class="no-results">No announcements available</div>';
      return;
    }

    sortedAnnouncements.forEach(ann => {
      renderAnnouncement(ann);
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
      renderAnnouncement(ann);
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

  // Render announcement
  function renderAnnouncement(ann) {
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
      </div>
      <div class="announcement-content">
        <div class="markdown-content">${announcementText}</div>
        ${attHtml}
        ${imgHtml}
      </div>
      <div class="announcement-footer">
        <button class="comment-btn">
          ${ann.comments && ann.comments.length 
            ? `Comments (${ann.comments.length})` 
            : 'Add class comment'}
        </button>
      </div>
      <div class="comments-section">
        <div class="comments-list">
          ${ann.comments && ann.comments.map(comment => `
            <div class="comment">
              <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
              <div class="comment-info">
                <span class="commenter-name">${comment.commenterName}</span>
                <p>${comment.text}</p>
                <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
              </div>
            </div>
          `).join('') || ''}
        </div>
        <div class="comment-input" style="display:none;">
          <textarea placeholder="Add a comment..."></textarea>
          <button class="post-comment-btn">Post</button>
        </div>
      </div>
    </div>`;
    feed.insertAdjacentHTML('beforeend', annHtml);
  }

  // Load assignments
  function loadAssignments(assignments) {
    const container = document.querySelector('.assignment-list');
    container.innerHTML = '';
    
    if (!assignments || assignments.length === 0) {
      container.innerHTML = '<div class="no-assignments">No assignments available</div>';
      return;
    }
    
    // Sort assignments by due date (closest due date first)
    assignments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    assignments.forEach(assignment => {
      const dueDate = new Date(assignment.dueDate);
      const status = assignment.status || 'Not Submitted';
      const statusClass = getStatusClass(status);
      
      const assignmentHtml = `
        <div class="assignment-card" data-id="${assignment.assignment_id}">
          <div class="assignment-header">
            <h3>${assignment.title}</h3>
            <div class="assignment-status ${statusClass}">${status}</div>
          </div>
          <div class="assignment-content">
            <p>${assignment.description}</p>
          </div>
          <div class="assignment-footer">
            <div class="due-date"><i class="far fa-clock"></i> Due: ${dueDate.toLocaleString()}</div>
            <div class="assignment-actions">
              <button class="view-assignment-btn">View Details</button>
              ${status !== 'Submitted' && status !== 'Graded' ? 
                '<button class="submit-assignment-btn">Submit</button>' : ''}
            </div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', assignmentHtml);
    });
    
    // Add event listeners to assignment buttons
    document.querySelectorAll('.view-assignment-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const assignmentId = this.closest('.assignment-card').getAttribute('data-id');
        window.location.href = `/assignment?classId=${classroomId}&assignmentId=${assignmentId}`;
      });
    });
    
    document.querySelectorAll('.submit-assignment-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const assignmentId = this.closest('.assignment-card').getAttribute('data-id');
        window.location.href = `/submit-assignment?classId=${classroomId}&assignmentId=${assignmentId}`;
      });
    });
  }
  
  function getStatusClass(status) {
    switch(status.toLowerCase()) {
      case 'submitted':
        return 'status-submitted';
      case 'graded':
        return 'status-graded';
      case 'late':
        return 'status-late';
      case 'not submitted':
      default:
        return 'status-pending';
    }
  }

  // Load quizzes
  function loadQuizzes(quizzes) {
    const container = document.querySelector('.quiz-list');
    container.innerHTML = '';
    
    if (!quizzes || quizzes.length === 0) {
      container.innerHTML = '<div class="no-quizzes">No quizzes or exams available</div>';
      return;
    }
    
    // Sort quizzes by start date (upcoming first)
    quizzes.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    
    quizzes.forEach(quiz => {
      const startTime = new Date(quiz.startTime);
      const endTime = quiz.endTime ? new Date(quiz.endTime) : null;
      const now = new Date();
      
      let status;
      let statusClass;
      
      if (now < startTime) {
        status = 'Upcoming';
        statusClass = 'status-upcoming';
      } else if (endTime && now > endTime) {
        status = quiz.submitted ? 'Completed' : 'Missed';
        statusClass = quiz.submitted ? 'status-completed' : 'status-missed';
      } else {
        status = 'In Progress';
        statusClass = 'status-inprogress';
      }
      
      const quizHtml = `
        <div class="quiz-card" data-id="${quiz.quiz_id}">
          <div class="quiz-header">
            <h3>${quiz.title}</h3>
            <div class="quiz-status ${statusClass}">${status}</div>
          </div>
          <div class="quiz-content">
            <p>${quiz.description}</p>
          </div>
          <div class="quiz-footer">
            <div class="quiz-time">
              <i class="fas fa-calendar-check"></i> 
              ${startTime.toLocaleString()} ${endTime ? ' - ' + endTime.toLocaleString() : ''}
            </div>
            <div class="quiz-actions">
              ${status === 'In Progress' ? '<button class="take-quiz-btn">Take Quiz</button>' : ''}
              ${status === 'Completed' ? '<button class="view-result-btn">View Results</button>' : ''}
              ${status === 'Upcoming' ? '<button class="view-details-btn">View Details</button>' : ''}
            </div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', quizHtml);
    });
    
    // Add event listeners to quiz buttons
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.closest('.quiz-card').getAttribute('data-id');
        window.location.href = `/quiz?classId=${classroomId}&quizId=${quizId}`;
      });
    });
    
    document.querySelectorAll('.view-result-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.closest('.quiz-card').getAttribute('data-id');
        window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
      });
    });
    
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.closest('.quiz-card').getAttribute('data-id');
        window.location.href = `/quiz-details?classId=${classroomId}&quizId=${quizId}`;
      });
    });
  }

  // Load performance data
  function loadPerformanceData(performance) {
    // Set overall metrics
    document.getElementById('overall-grade').textContent = performance.overallGrade || 'N/A';
    document.getElementById('assignments-grade').textContent = performance.assignmentsGrade || 'N/A';
    document.getElementById('quizzes-grade').textContent = performance.quizzesGrade || 'N/A';
    
    // Remove loading indicator
    document.getElementById('loading-chart').style.display = 'none';
    
    // Create performance chart if data is available
    if (performance.assessments && performance.assessments.length > 0) {
      const ctx = document.getElementById('performanceChart').getContext('2d');
      
      // Prepare data for chart
      const labels = performance.assessments.map(assessment => assessment.title);
      const scores = performance.assessments.map(assessment => assessment.score);
      const maxScores = performance.assessments.map(assessment => assessment.maxScore);
      
      const percentages = scores.map((score, index) => (score / maxScores[index]) * 100);
      
      // Create chart
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Your Score (%)',
            data: percentages,
            backgroundColor: percentages.map(percentage => 
              percentage < 60 ? 'rgba(234, 67, 53, 0.7)' :
              percentage < 70 ? 'rgba(251, 188, 5, 0.7)' :
              percentage < 80 ? 'rgba(66, 133, 244, 0.7)' :
              'rgba(52, 168, 83, 0.7)'
            ),
            borderWidth: 1
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
              }
            },
            x: {
              title: {
                display: true,
                text: 'Assessment'
              }
            }
          }
        }
      });
    } else {
      document.getElementById('loading-chart').textContent = 'No assessment data available';
    }
  }

  // Load resources
  function loadResources(resources) {
    const container = document.querySelector('.resources-list');
    container.innerHTML = '';
    
    if (!resources || resources.length === 0) {
      container.innerHTML = '<div class="no-resources">No resources available</div>';
      return;
    }
    
    // Group resources by category
    const resourcesByCategory = {};
    resources.forEach(resource => {
      const category = resource.category || 'Other';
      if (!resourcesByCategory[category]) {
        resourcesByCategory[category] = [];
      }
      resourcesByCategory[category].push(resource);
    });
    
    // Render resources by category
    Object.keys(resourcesByCategory).forEach(category => {
      const categoryHtml = `
        <div class="resource-category">
          <h3>${category}</h3>
          <div class="resource-items">
            ${resourcesByCategory[category].map(resource => `
              <div class="resource-card">
                <div class="resource-icon">
                  ${getResourceIcon(resource.type)}
                </div>
                <div class="resource-info">
                  <h4>${resource.title}</h4>
                  <p>${resource.description || ''}</p>
                </div>
                <div class="resource-actions">
                  <a href="${resource.url}" target="_blank" class="resource-btn">
                    ${resource.type === 'video' ? 'Watch' : 'View'}
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', categoryHtml);
    });
  }
  
  function getResourceIcon(type) {
    switch(type) {
      case 'video':
        return '<i class="fas fa-video"></i>';
      case 'document':
        return '<i class="fas fa-file-alt"></i>';
      case 'pdf':
        return '<i class="fas fa-file-pdf"></i>';
      case 'presentation':
        return '<i class="fas fa-file-powerpoint"></i>';
      case 'link':
        return '<i class="fas fa-link"></i>';
      default:
        return '<i class="fas fa-file"></i>';
    }
  }

  // Set up event listeners for search and sort
  document.getElementById('announcement-search').addEventListener('input', filterAnnouncements);
  document.getElementById('search-btn').addEventListener('click', filterAnnouncements);
  document.getElementById('sort-announcements').addEventListener('change', sortAnnouncements);

  // Toggle comment section and handle comment posting
  document.addEventListener('click', function(event) {
    // Toggle comment section
    if (event.target.classList.contains('comment-btn')) {
      const commentSection = event.target.closest('.announcement-card').querySelector('.comments-section');
      const commentInput = commentSection.querySelector('.comment-input');
      commentInput.style.display = commentInput.style.display === 'none' ? 'flex' : 'none';
    }
    
    // Handle comment posting
    if (event.target.classList.contains('post-comment-btn')) {
      const commentInput = event.target.previousElementSibling;
      const text = commentInput.value.trim();
      if (text) {
        const commentsList = event.target.closest('.comments-section').querySelector('.comments-list');
        const announcementCard = event.target.closest('.announcement-card');
        const announcementId = announcementCard.getAttribute('data-id');
        const token = localStorage.getItem('access_token');
        
        // Disable button and show loading state
        event.target.disabled = true;
        event.target.innerHTML = '<span class="spinner"></span> Posting...';
        
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
                <img src="https://i.pravatar.cc/40" alt="Profile" class="profile-pic">
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
            
            showNotification('Comment posted successfully.', 'success');
          } else {
            showNotification('Failed to post comment', 'error');
          }
          
          // Reset button
          event.target.disabled = false;
          event.target.textContent = 'Post';
        })
        .catch(err => {
          console.error(err);
          showNotification('Error posting comment', 'error');
          
          // Reset button
          event.target.disabled = false;
          event.target.textContent = 'Post';
        });
      }
    }
  });

  // Function to show notification
  function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
      existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-message">${message}</div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Show notification with animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 5000);
  }

  // Initialize the page
  init();
}); 