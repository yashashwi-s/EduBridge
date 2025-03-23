document.addEventListener('DOMContentLoaded', function () {
  // Global variables
  let classroomId;
  let teacherNameGlobal;
  let teacherAvatarGlobal = 'images/image.png';

  // Initialize MathJax for LaTeX support
  if (window.MathJax) {
    console.log("MathJax is available - initializing");
  } else {
    console.log("MathJax not found - will attempt to load dynamically");
    // MathJax configuration is already in HTML, no need to reconfigure here
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
    if (window.MathJax && window.MathJax.typeset) {
      console.log("Typesetting all LaTeX content");
      // Process LaTeX in all announcement content divs with class tex2jax_process
      const markdownElements = document.querySelectorAll('.tex2jax_process');
      if (markdownElements.length > 0) {
        window.MathJax.typeset(Array.from(markdownElements));
      }
    } else {
      console.warn("MathJax not fully loaded or typeset function unavailable");
    }
  }

  // Function to filter announcements by search term
  function filterAnnouncements() {
    if (!window.allAnnouncements) return;
    
    const searchInput = document.getElementById('announcement-search');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const sortOrder = document.getElementById('sort-announcements').value;
    const feed = document.querySelector('.announcements-feed');
    
    // Add loading state to search container
    const searchContainer = document.querySelector('.search-container');
    searchContainer.classList.add('searching');
    
    // Clear the feed with a small delay to show loading state
    setTimeout(() => {
      feed.innerHTML = '';
      
      if (!searchTerm) {
        // If no search term, just sort and display all
        sortAnnouncementsByDate(sortOrder);
        searchContainer.classList.remove('searching');
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
        feed.innerHTML = `
          <div class="no-results">
            <i class="fas fa-search"></i>
            <p>No announcements match your search "${searchTerm}"</p>
            <button class="clear-search-btn">Clear Search</button>
          </div>`;
        
        document.querySelector('.clear-search-btn').addEventListener('click', () => {
          searchInput.value = '';
          filterAnnouncements();
        });
        
        searchContainer.classList.remove('searching');
        return;
      }
      
      // Show search result count
      feed.insertAdjacentHTML('beforebegin', `
        <div class="search-results-info">
          Found ${filteredAnnouncements.length} announcement${filteredAnnouncements.length !== 1 ? 's' : ''} 
          matching "${searchTerm}"
          <button class="clear-search-btn">Clear</button>
        </div>
      `);
      
      document.querySelector('.clear-search-btn').addEventListener('click', () => {
        searchInput.value = '';
        document.querySelector('.search-results-info').remove();
        filterAnnouncements();
      });
      
      // Render the filtered and sorted announcements
      filteredAnnouncements.forEach(ann => {
        renderAnnouncement(ann);
      });
      
      // Highlight search terms in the rendered announcements
      if (searchTerm) {
        highlightSearchTerms(searchTerm);
      }
      
      // Render LaTeX in filtered announcements
      if (window.MathJax && window.MathJax.typeset) {
        // Process LaTeX in all announcement content divs with class tex2jax_process
        const markdownElements = document.querySelectorAll('.tex2jax_process');
        if (markdownElements.length > 0) {
          window.MathJax.typeset(Array.from(markdownElements));
        }
      }
      
      searchContainer.classList.remove('searching');
    }, 300);
  }

  // Function to highlight search terms in the rendered announcements
  function highlightSearchTerms(searchTerm) {
    const contentElements = document.querySelectorAll('.markdown-content, .markdown-comment');
    
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

  // Function to render announcement content
  function renderAnnouncementContent(content) {
    // First convert markdown to HTML
    const htmlContent = marked.parse(content);
    // Then process LaTeX in the HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    tempDiv.classList.add('tex2jax_process');
    return tempDiv.innerHTML;
  }

  // Function to render comment content
  function renderCommentContent(content) {
    // Only convert markdown to HTML, no LaTeX processing
    return marked.parse(content);
  }

  // Function to create announcement element
  function createAnnouncementElement(announcement) {
    const announcementElement = document.createElement('div');
    announcementElement.className = 'announcement';
    announcementElement.innerHTML = `
      <div class="announcement-header">
        <div class="announcement-author">
          <img src="${announcement.authorAvatar || 'images/image.png'}" alt="${announcement.authorName}" class="author-avatar">
          <div class="author-info">
            <span class="author-name">${announcement.authorName}</span>
            <span class="announcement-date">${formatDate(announcement.date)}</span>
          </div>
        </div>
      </div>
      <div class="announcement-content markdown-content tex2jax_process">
        ${renderAnnouncementContent(announcement.content)}
      </div>
      <div class="announcement-actions">
        <button class="like-btn" data-announcement-id="${announcement.id}">
          <i class="fas fa-heart"></i>
          <span class="like-count">${announcement.likes || 0}</span>
        </button>
        <button class="comment-btn" data-announcement-id="${announcement.id}">
          <i class="fas fa-comment"></i>
          <span class="comment-count">${announcement.comments?.length || 0}</span>
        </button>
      </div>
      <div class="comments-section" style="display: none;">
        <div class="comments-list">
          ${(announcement.comments || []).map(comment => `
            <div class="comment">
              <div class="comment-header">
                <img src="${comment.authorAvatar || 'images/image.png'}" alt="${comment.authorName}" class="comment-avatar">
                <div class="comment-info">
                  <span class="comment-author">${comment.authorName}</span>
                  <span class="comment-date">${formatDate(comment.date)}</span>
                </div>
              </div>
              <div class="markdown-comment">
                ${renderCommentContent(comment.content)}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="comment-input">
          <textarea placeholder="Write a comment..." data-announcement-id="${announcement.id}"></textarea>
          <button class="post-comment-btn" data-announcement-id="${announcement.id}">Post</button>
        </div>
      </div>
    `;

    // Process LaTeX in the announcement content
    const announcementContent = announcementElement.querySelector('.announcement-content');
    if (announcementContent) {
      MathJax.typesetPromise([announcementContent]).catch((err) => console.error('Error processing LaTeX:', err));
    }

    return announcementElement;
  }

  // Function to render an announcement
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
        <div class="markdown-content tex2jax_process">${announcementText}</div>
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
                <p class="markdown-comment">${commentText}</p>
                <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
              </div>
            </div>
          `}).join('') || ''}
        </div>
        <div class="comment-input" style="display:none;">
          <textarea placeholder="Add a class comment..."></textarea>
          <button class="post-comment-btn">Post</button>
        </div>
      </div>
    </div>`;
    feed.insertAdjacentHTML('beforeend', annHtml);
    
    // Process LaTeX in the newly added announcement immediately
    if (window.MathJax) {
      const latestAnnouncement = feed.lastElementChild;
      if (latestAnnouncement) {
        const markdownContent = latestAnnouncement.querySelector('.markdown-content');
        if (markdownContent) {
          window.MathJax.typeset([markdownContent]);
        }
      }
    }
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
  document.getElementById('announcement-search').addEventListener('input', debounce(filterAnnouncements, 300));
  document.getElementById('search-btn').addEventListener('click', function(e) {
    e.preventDefault();
    filterAnnouncements();
  });
  document.getElementById('sort-announcements').addEventListener('change', sortAnnouncements);

  // Add keypress event for search input
  document.getElementById('announcement-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      filterAnnouncements();
    }
  });

  // Debounce function to prevent excessive filtering during typing
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }

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
            // Parse comment text with Markdown if available
            let commentText = data.comment.text;
            if (typeof marked !== 'undefined') {
              commentText = marked.parse(commentText);
            }
            
            const commentHtml = `
              <div class="comment">
                <img src="images/image.png" alt="Profile" class="profile-pic">
                <div class="comment-info">
                  <span class="commenter-name">${data.comment.commenterName}</span>
                  <p class="markdown-comment">${commentText}</p>
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
            
            // Process LaTeX in the newly added comment
            if (window.MathJax) {
              const newComment = commentsList.lastElementChild;
              if (newComment) {
                const commentText = newComment.querySelector('.markdown-comment');
                if (commentText) {
                  window.MathJax.typeset([commentText]);
                }
              }
            }
            
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

  // Quiz Management for Students
  let availableQuizzes = [];
  let currentQuiz = null;
  let quizTimer = null;
  let userAnswers = {};
  let activeQuestionIndex = 0;
  let quizStartTime = null;
  let submitting = false;

  // Initialize quiz functionality if the quiz tab exists
  if (document.getElementById('quizzes')) {
    initializeStudentQuizzes();
  }

  function initializeStudentQuizzes() {
    // Filter quizzes by status
    const statusFilter = document.getElementById('quiz-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        renderQuizzes();
      });
    }
    
    // Load quizzes
    loadStudentQuizzes();
    
    // Setup modal close buttons
    const closeModalButtons = document.querySelectorAll('.close-modal');
    closeModalButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const modal = btn.closest('.modal');
        closeModal(modal);
      });
    });
    
    // Setup for quiz instructions modal
    const cancelQuizBtn = document.querySelector('.cancel-quiz-btn');
    if (cancelQuizBtn) {
      cancelQuizBtn.addEventListener('click', function() {
        const modal = document.getElementById('quiz-instructions-modal');
        closeModal(modal);
      });
    }
    
    // Setup for starting a quiz
    const startQuizBtn = document.querySelector('.start-quiz-btn');
    if (startQuizBtn) {
      startQuizBtn.addEventListener('click', function() {
        const instructionsModal = document.getElementById('quiz-instructions-modal');
        closeModal(instructionsModal);
        startQuiz(currentQuiz);
      });
    }
    
    // Setup for navigating questions
    const prevQuestionBtn = document.getElementById('prev-question');
    const nextQuestionBtn = document.getElementById('next-question');
    
    if (prevQuestionBtn && nextQuestionBtn) {
      prevQuestionBtn.addEventListener('click', function() {
        navigateToQuestion(activeQuestionIndex - 1);
      });
      
      nextQuestionBtn.addEventListener('click', function() {
        navigateToQuestion(activeQuestionIndex + 1);
      });
    }
    
    // Setup for submitting a quiz
    const submitQuizBtn = document.getElementById('submit-quiz');
    if (submitQuizBtn) {
      submitQuizBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to submit this quiz? You cannot change your answers after submission.')) {
          submitQuiz();
        }
      });
    }
    
    // Close quiz results
    const closeResultsBtn = document.querySelector('.close-results-btn');
    if (closeResultsBtn) {
      closeResultsBtn.addEventListener('click', function() {
        const resultsModal = document.getElementById('quiz-results-modal');
        closeModal(resultsModal);
      });
    }
    
    // Handle click on question navigation buttons (use event delegation)
    document.getElementById('question-nav-buttons')?.addEventListener('click', function(e) {
      const btn = e.target.closest('.question-nav-btn');
      if (btn) {
        const questionIndex = parseInt(btn.dataset.index);
        navigateToQuestion(questionIndex);
      }
    });
    
    // Handle click on options (use event delegation)
    document.getElementById('options-container')?.addEventListener('click', function(e) {
      const option = e.target.closest('.option-item');
      if (option && !submitting) {
        selectOption(option);
      }
    });
  }

  function loadStudentQuizzes() {
    const quizList = document.querySelector('.quiz-list');
    if (!quizList) return;
    
    quizList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading quizzes...</div>';
    
    // Fetch quizzes from the database
    fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch quizzes');
        }
        return response.json();
      })
      .then(data => {
        availableQuizzes = data;
        renderQuizzes();
      })
      .catch(error => {
        console.error('Error loading quizzes:', error);
        quizList.innerHTML = '<div class="no-quizzes">Failed to load quizzes. Please try again later.</div>';
      });
  }

  function renderQuizzes() {
    const quizList = document.querySelector('.quiz-list');
    if (!quizList) return;
    
    const filterValue = document.getElementById('quiz-status-filter')?.value || 'all';
    
    // Filter quizzes based on selected filter
    let filteredQuizzes = [...availableQuizzes];
    
    if (filterValue !== 'all') {
      filteredQuizzes = availableQuizzes.filter(quiz => quiz.studentStatus === filterValue);
    }
    
    if (filteredQuizzes.length === 0) {
      quizList.innerHTML = `<div class="no-quizzes">No ${filterValue} quizzes found.</div>`;
      return;
    }
    
    quizList.innerHTML = '';
    
    // Sort quizzes: available first, then upcoming, then completed, then missed
    const statusOrder = { 'available': 0, 'upcoming': 1, 'completed': 2, 'missed': 3 };
    
    filteredQuizzes.sort((a, b) => {
      // First sort by status
      const statusDiff = statusOrder[a.studentStatus] - statusOrder[b.studentStatus];
      if (statusDiff !== 0) return statusDiff;
      
      // Then by date (newest first for available, oldest first for upcoming)
      if (a.studentStatus === 'available' || a.studentStatus === 'completed') {
        return new Date(b.startTime) - new Date(a.startTime);
      } else {
        return new Date(a.startTime) - new Date(b.startTime);
      }
    });
    
    filteredQuizzes.forEach(quiz => {
      const startDate = new Date(quiz.startTime);
      const endDate = new Date(quiz.endTime);
      
      const formattedDate = startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      const formattedTime = startDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const statusLabels = {
        'available': 'Available Now',
        'upcoming': 'Upcoming',
        'completed': 'Completed',
        'missed': 'Missed'
      };
      
      let actionButton = '';
      
      if (quiz.studentStatus === 'available') {
        actionButton = `<button class="take-quiz-btn" data-quiz-id="${quiz.id}"><i class="fas fa-play"></i> Take Quiz</button>`;
      } else if (quiz.studentStatus === 'upcoming') {
        actionButton = `<button class="take-quiz-btn disabled-btn" disabled><i class="fas fa-clock"></i> Not Available Yet</button>`;
      } else if (quiz.studentStatus === 'completed') {
        actionButton = `<button class="view-results-btn" data-quiz-id="${quiz.id}"><i class="fas fa-chart-bar"></i> View Results</button>`;
      } else if (quiz.studentStatus === 'missed') {
        actionButton = `<button class="view-results-btn disabled-btn" disabled><i class="fas fa-times-circle"></i> Missed</button>`;
      }
      
      quizList.insertAdjacentHTML('beforeend', `
        <div class="quiz-card" data-quiz-id="${quiz.id}">
          <div class="quiz-card-header">
            <div class="quiz-card-title">
              <h3>${quiz.title}</h3>
              <p>${quiz.description}</p>
            </div>
          </div>
          <div class="quiz-card-meta">
            <span class="meta-item"><i class="fas fa-calendar-check"></i> ${formattedDate} - ${formattedTime}</span>
            <span class="meta-item"><i class="fas fa-clock"></i> ${quiz.duration} minutes</span>
            <span class="meta-item"><i class="fas fa-question-circle"></i> ${quiz.questions.length} Questions</span>
            <span class="quiz-status-badge status-${quiz.studentStatus}">${statusLabels[quiz.studentStatus]}</span>
          </div>
          <div class="quiz-card-actions">
            ${actionButton}
          </div>
        </div>
      `);
    });
    
    // Add event listeners to take quiz buttons
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      if (!btn.classList.contains('disabled-btn')) {
        btn.addEventListener('click', function() {
          const quizId = this.dataset.quizId;
          openQuizInstructions(quizId);
        });
      }
    });
    
    // Add event listeners to view results buttons
    document.querySelectorAll('.view-results-btn').forEach(btn => {
      if (!btn.classList.contains('disabled-btn')) {
        btn.addEventListener('click', function() {
          const quizId = this.dataset.quizId;
          viewQuizResults(quizId);
        });
      }
    });
  }

  function openQuizInstructions(quizId) {
    const quiz = availableQuizzes.find(q => q.id === quizId);
    if (!quiz) return;
    
    // Set current quiz
    currentQuiz = quiz;
    
    // Populate the instructions modal
    document.getElementById('quiz-title-display').textContent = quiz.title;
    document.getElementById('quiz-description-display').textContent = quiz.description;
    document.getElementById('quiz-duration-display').textContent = quiz.duration;
    document.getElementById('quiz-questions-count').textContent = quiz.questions.length;
    
    const endDate = new Date(quiz.endTime);
    document.getElementById('quiz-end-time').textContent = endDate.toLocaleString();
    
    // Open the modal
    const modal = document.getElementById('quiz-instructions-modal');
    openModal(modal);
  }

  function startQuiz(quiz) {
    if (!quiz) return;
    
    // Reset quiz state
    activeQuestionIndex = 0;
    userAnswers = {};
    quizStartTime = new Date();
    submitting = false;
    
    // Setup timer
    const durationInMs = quiz.duration * 60 * 1000;
    const endTime = new Date(quizStartTime.getTime() + durationInMs);
    
    // Setup quiz interface
    document.getElementById('taking-quiz-title').textContent = quiz.title;
    
    // Generate question navigation buttons
    const navContainer = document.getElementById('question-nav-buttons');
    navContainer.innerHTML = '';
    
    quiz.questions.forEach((question, index) => {
      navContainer.insertAdjacentHTML('beforeend', `
        <button class="question-nav-btn ${index === 0 ? 'current' : ''}" data-index="${index}">
          ${index + 1}
        </button>
      `);
    });
    
    // Display first question
    displayQuestion(0);
    
    // Start the timer
    startQuizTimer(endTime);
    
    // Open the quiz taking modal
    const modal = document.getElementById('quiz-taking-modal');
    openModal(modal);
    
    // Notify the server that the student has started the quiz
    fetch(`/api/classrooms/${classroomId}/quizzes/${quiz.id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
    .catch(error => {
      console.error('Error marking quiz as started:', error);
    });
  }

  function startQuizTimer(endTime) {
    // Clear any existing timer
    if (quizTimer) {
      clearInterval(quizTimer);
    }
    
    // Update timer display
    updateTimerDisplay(endTime);
    
    // Set interval to update timer every second
    quizTimer = setInterval(() => {
      const remaining = updateTimerDisplay(endTime);
      
      // Auto-submit when time is up
      if (remaining <= 0) {
        clearInterval(quizTimer);
        showNotification('Time is up! Your quiz is being submitted.', 'warning');
        submitQuiz();
      }
    }, 1000);
  }

  function updateTimerDisplay(endTime) {
    const now = new Date();
    const remaining = endTime - now;
    
    if (remaining <= 0) {
      document.getElementById('time-remaining').textContent = '00:00';
      return 0;
    }
    
    // Format remaining time as MM:SS
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    document.getElementById('time-remaining').textContent = `${formattedMinutes}:${formattedSeconds}`;
    
    // Change color to red if less than 1 minute remaining
    if (remaining < 60000) {
      document.getElementById('time-remaining').style.color = '#d93025';
    } else {
      document.getElementById('time-remaining').style.color = '';
    }
    
    return remaining;
  }

  function displayQuestion(index) {
    if (!currentQuiz || !currentQuiz.questions[index]) return;
    
    const question = currentQuiz.questions[index];
    activeQuestionIndex = index;
    
    // Update question display
    document.getElementById('question-number').textContent = `Question ${index + 1} of ${currentQuiz.questions.length}`;
    document.getElementById('question-text').textContent = question.text;
    
    // Generate options
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    question.options.forEach((option, optionIndex) => {
      const isSelected = userAnswers[index] === optionIndex.toString();
      
      optionsContainer.insertAdjacentHTML('beforeend', `
        <div class="option-item ${isSelected ? 'selected' : ''}" data-option-index="${optionIndex}">
          <div class="option-radio"></div>
          <div class="option-text">${option.text}</div>
        </div>
      `);
    });
    
    // Update navigation buttons
    document.querySelectorAll('.question-nav-btn').forEach((btn, btnIndex) => {
      btn.classList.toggle('current', btnIndex === index);
      btn.classList.toggle('answered', userAnswers[btnIndex] !== undefined);
    });
    
    // Update prev/next buttons state
    document.getElementById('prev-question').disabled = index === 0;
    document.getElementById('next-question').disabled = index === currentQuiz.questions.length - 1;
  }

  function navigateToQuestion(index) {
    if (index < 0 || !currentQuiz || index >= currentQuiz.questions.length) return;
    displayQuestion(index);
  }

  function selectOption(optionElement) {
    const optionIndex = optionElement.dataset.optionIndex;
    const questionIndex = activeQuestionIndex;
    
    // Clear previously selected option
    document.querySelectorAll('.option-item').forEach(option => {
      option.classList.remove('selected');
    });
    
    // Mark this option as selected
    optionElement.classList.add('selected');
    
    // Save the answer
    userAnswers[questionIndex] = optionIndex;
    
    // Update the navigation button for this question
    const navBtn = document.querySelector(`.question-nav-btn[data-index="${questionIndex}"]`);
    navBtn.classList.add('answered');
    
    // Automatically go to next question if this isn't the last one
    if (questionIndex < currentQuiz.questions.length - 1) {
      // Use a small delay to allow user to see their selection
      setTimeout(() => {
        navigateToQuestion(questionIndex + 1);
      }, 300);
    }
  }

  function submitQuiz() {
    if (submitting) return;
    submitting = true;
    
    // Disable the submit button and show loading
    const submitBtn = document.getElementById('submit-quiz');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    // Stop the timer
    if (quizTimer) {
      clearInterval(quizTimer);
    }
    
    // Prepare submission data
    const submission = {
      quizId: currentQuiz.id,
      startTime: quizStartTime.toISOString(),
      endTime: new Date().toISOString(),
      answers: {}
    };
    
    // Format answers to match what the server expects
    Object.keys(userAnswers).forEach(questionIndex => {
      const questionId = currentQuiz.questions[questionIndex].id;
      const optionId = currentQuiz.questions[questionIndex].options[userAnswers[questionIndex]].id;
      submission.answers[questionId] = optionId;
    });
    
    // Submit to server
    fetch(`/api/classrooms/${classroomId}/quizzes/${currentQuiz.id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      },
      body: JSON.stringify(submission)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to submit quiz');
      }
      return response.json();
    })
    .then(results => {
      // Close the quiz taking modal
      const quizTakingModal = document.getElementById('quiz-taking-modal');
      closeModal(quizTakingModal);
      
      // Show results
      displayQuizResults(results);
      
      // Update quiz list to show completed status
      loadStudentQuizzes();
    })
    .catch(error => {
      console.error('Error submitting quiz:', error);
      showNotification('Failed to submit quiz. Please try again.', 'error');
      
      // Re-enable the submit button
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Quiz';
      submitting = false;
    });
  }

  function viewQuizResults(quizId) {
    // Fetch quiz results from server
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results/student`, {
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
        displayQuizResults(results);
      })
      .catch(error => {
        console.error('Error fetching quiz results:', error);
        showNotification('Failed to fetch quiz results', 'error');
      });
  }

  function displayQuizResults(results) {
    // Update summary statistics
    document.getElementById('score-percentage').textContent = `${results.percentage}%`;
    document.getElementById('points-scored').textContent = results.score;
    document.getElementById('total-points').textContent = results.totalPossible;
    document.getElementById('correct-answers').textContent = results.correctCount;
    document.getElementById('total-questions').textContent = results.totalQuestions;
    
    // Update detailed results
    const detailedResults = document.getElementById('detailed-results');
    detailedResults.innerHTML = '';
    
    results.questions.forEach((question, index) => {
      const isCorrect = question.isCorrect;
      const statusText = isCorrect ? 'Correct' : 'Incorrect';
      const statusClass = isCorrect ? 'correct-status' : 'incorrect-status';
      
      const questionHtml = `
        <div class="question-result">
          <div class="question-result-header">
            <div class="question-result-title">Question ${index + 1}</div>
            <div class="question-status ${statusClass}">${statusText}</div>
          </div>
          <div class="question-result-body">
            <div>${question.text}</div>
            <div class="question-result-options">
              ${generateResultOptions(question)}
            </div>
          </div>
        </div>
      `;
      
      detailedResults.insertAdjacentHTML('beforeend', questionHtml);
    });
    
    // Open the results modal
    const modal = document.getElementById('quiz-results-modal');
    openModal(modal);
  }

  function generateResultOptions(question) {
    let optionsHtml = '';
    
    question.options.forEach(option => {
      let optionClass = '';
      let indicator = '';
      
      if (option.id === question.userAnswer && option.isCorrect) {
        // User selected correctly
        optionClass = 'correct-answer';
        indicator = '<div class="result-option-indicator correct-indicator"><i class="fas fa-check"></i></div>';
      } else if (option.id === question.userAnswer && !option.isCorrect) {
        // User selected incorrectly
        optionClass = 'incorrect-answer';
        indicator = '<div class="result-option-indicator incorrect-indicator"><i class="fas fa-times"></i></div>';
      } else if (option.isCorrect) {
        // Correct answer that user didn't select
        optionClass = 'correct-answer';
        indicator = '<div class="result-option-indicator correct-indicator"><i class="fas fa-check"></i></div>';
      } else if (option.id === question.userAnswer) {
        // User selected this option
        optionClass = 'user-selected';
        indicator = '<div class="result-option-indicator">●</div>';
      } else {
        // Normal option
        indicator = '<div class="result-option-indicator">○</div>';
      }
      
      optionsHtml += `
        <div class="result-option ${optionClass}">
          ${indicator}
          <div class="result-option-text">${option.text}</div>
        </div>
      `;
    });
    
    return optionsHtml;
  }

  function openModal(modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
      modal.querySelector('.modal-content').style.opacity = '1';
    }, 10);
  }

  function closeModal(modal) {
    modal.classList.remove('active');
    modal.querySelector('.modal-content').style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }

  // Function to handle posting a new comment
  function handlePostComment(announcementId, commentContent) {
    const token = localStorage.getItem('access_token');
    if (!token) {
      showNotification('Please log in to post a comment', 'error');
      return;
    }

    fetch('/api/announcements/' + announcementId + '/comments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: commentContent })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to post comment');
      }
      return response.json();
    })
    .then(data => {
      // Create new comment element
      const commentElement = document.createElement('div');
      commentElement.className = 'comment';
      commentElement.innerHTML = `
        <div class="comment-header">
          <img src="${data.authorAvatar || 'images/image.png'}" alt="${data.authorName}" class="comment-avatar">
          <div class="comment-info">
            <span class="comment-author">${data.authorName}</span>
            <span class="comment-date">${formatDate(data.date)}</span>
          </div>
        </div>
        <div class="markdown-comment">
          ${renderCommentContent(data.content)}
        </div>
      `;

      // Add the new comment to the comments list
      const commentsList = document.querySelector(`[data-announcement-id="${announcementId}"]`)
        .closest('.announcement')
        .querySelector('.comments-list');
      commentsList.appendChild(commentElement);

      // Update comment count
      const commentCount = document.querySelector(`[data-announcement-id="${announcementId}"]`)
        .closest('.announcement')
        .querySelector('.comment-count');
      commentCount.textContent = parseInt(commentCount.textContent) + 1;

      // Clear the comment input
      const commentInput = document.querySelector(`textarea[data-announcement-id="${announcementId}"]`);
      commentInput.value = '';

      showNotification('Comment posted successfully', 'success');
    })
    .catch(error => {
      console.error('Error posting comment:', error);
      showNotification('Failed to post comment', 'error');
    });
  }

  // Event listener for post comment buttons
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('post-comment-btn')) {
      const announcementId = e.target.dataset.announcementId;
      const commentInput = document.querySelector(`textarea[data-announcement-id="${announcementId}"]`);
      const commentContent = commentInput.value.trim();
      
      if (commentContent) {
        handlePostComment(announcementId, commentContent);
      } else {
        showNotification('Please enter a comment', 'error');
      }
    }
  });
}); 