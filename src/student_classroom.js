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
      
      // If switching to quizzes tab, reload quizzes to ensure they're up to date
      if (tabId === 'quizzes') {
        // Only reload if the quiz tab exists and we have a classroom ID
        if (document.getElementById('quizzes') && classroomId) {
          console.log('Switching to quizzes tab, reloading quizzes');
          loadStudentQuizzes();
        }
      }
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
        // Log data for debugging
        console.log('Classroom data received:', data);
        
        teacherNameGlobal = data.teacherName || "Teacher Name";
        teacherAvatarGlobal = data.teacherAvatar || "images/image.png";
        
        // Update classroom header
        const header = document.querySelector('.classroom-header');
        document.querySelector('.classroom-header h1').textContent = data.className || "Course Name";
        document.querySelector('.classroom-header p').textContent = `${data.section || "Section"} - ${data.subject || "Subject"}`;
        
        
        
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
        
        // Add controls for search and sort
        const feed = document.querySelector('.announcements-feed');
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
        
        // Add controls before the feed content if they don't already exist
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
        console.error('Error loading classroom data:', err);
        showNotification('Error loading classroom data.', 'error');
      });
  }

  // Helper function to set background image based on subject
  function useSubjectBasedImage(subject, headerElement) {
    const subjectLower = (subject || '').toLowerCase();
    let themeImage;
    
    // Subject-based image selection
    switch (subjectLower) {
      case 'math':
      case 'mathematics':
        themeImage = 'https://www.gstatic.com/classroom/themes/Math.jpg';
        break;
      case 'physics':
        themeImage = 'https://www.gstatic.com/classroom/themes/Physics.jpg';
        break;
      case 'chemistry':
        themeImage = 'https://www.gstatic.com/classroom/themes/Chemistry.jpg';
        break;
      case 'biology':
        themeImage = 'https://www.gstatic.com/classroom/themes/img_bioneural.jpg';
        break;
      case 'computer science':
      case 'programming':
      case 'coding':
        themeImage = 'https://www.gstatic.com/classroom/themes/img_code.jpg';
        break;
      case 'history':
        themeImage = 'https://www.gstatic.com/classroom/themes/History.jpg';
        break;
      case 'english':
      case 'literature':
        themeImage = 'https://www.gstatic.com/classroom/themes/Writing.jpg';
        break;
      case 'art':
        themeImage = 'https://www.gstatic.com/classroom/themes/img_arts.jpg';
        break;
      case 'music':
        themeImage = 'https://www.gstatic.com/classroom/themes/img_orchestra.jpg';
        break;
      default:
        // Default image for other subjects
        themeImage = 'https://www.gstatic.com/classroom/themes/img_reachout.jpg';
    }
    
    headerElement.style.backgroundImage = `url('${themeImage}')`;
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
  function renderAnnouncement(announcement) {
    const feed = document.querySelector('.announcements-feed');
    
    let announcementText = announcement.text;
    if (typeof marked !== 'undefined') {
        announcementText = marked.parse(announcement.text);
    }
    
    const attHtml = announcement.attachments && announcement.attachments.length ? 
        `<div class="attachments">
            ${announcement.attachments.map(att => 
                `<a href="${att.url}" target="_blank" class="attachment-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    ${att.name}
                </a>`
            ).join(' ')}
        </div>` : '';
    
    // Ensure proper handling of images in different formats
    const imgHtml = announcement.images && announcement.images.length ? 
        `<div class="images">
            ${announcement.images.map(img => 
                `<a href="${img.url || img}" target="_blank" class="image-link">
                    <img src="${img.url || img}" alt="${img.name || 'Image'}" class="announcement-image">
                </a>`
            ).join(' ')}
        </div>` : '';
    
    const announcementHtml = `
        <div class="announcement-card" data-id="${announcement.announcement_id}">
            <div class="announcement-header">
                <img src="${teacherAvatarGlobal}" alt="Teacher" class="profile-pic">
                <div class="poster-info">
                    <span class="poster-name">${teacherNameGlobal}</span>
                    <span class="post-time">${new Date(announcement.postTime).toLocaleString()}</span>
                </div>
            </div>
            <div class="announcement-content">
                <div class="markdown-content tex2jax_process">${announcementText}</div>
                ${attHtml}
                ${imgHtml}
            </div>
            <div class="announcement-footer">
                <button class="comment-btn">
                    ${announcement.comments && announcement.comments.length ? 
                        `Comments (${announcement.comments.length})` : 
                        'Add class comment'}
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
                                <p class="markdown-comment">${commentText}</p>
                                <span class="comment-time">${new Date(comment.commentTime).toLocaleString()}</span>
                            </div>
                        </div>
                        `;
                    }).join('') || ''}
                </div>
                <div class="comment-input" style="display:none;">
                    <textarea placeholder="Add a comment..."></textarea>
                    <button class="post-comment-btn">Post</button>
                </div>
            </div>
        </div>
    `;
    
    feed.insertAdjacentHTML('beforeend', announcementHtml);
    
    // Render LaTeX if MathJax is available
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
      // Handle MongoDB IDs - for quiz objects from MongoDB, the id might be in _id or id
      const quizId = quiz.id || quiz._id;
      
      // Create Date objects from ISO strings using the helper
      const startTime = EduQuiz.parseDate(quiz.startTime);
      const endTime = quiz.endTime ? EduQuiz.parseDate(quiz.endTime) : null;
      const now = new Date();
      
      // Format dates in user-friendly format with timezone consideration
      const formatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      };
      
      const formattedStartTime = startTime.toLocaleString(undefined, formatOptions);
      const formattedEndTime = endTime ? endTime.toLocaleString(undefined, formatOptions) : '';
      
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
      
      // Check if it's a PDF quiz (has quizType property set to 'pdf') or legacy question-based quiz
      const isPdfQuiz = quiz.quizType === 'pdf';
      
      // Calculate the quiz duration in a readable format
      const durationMinutes = quiz.duration ? Math.floor(quiz.duration / 60) : 0;
      const durationText = durationMinutes > 0 ? `${durationMinutes} minutes` : 'No time limit';
      
      // For question count, handle both quiz types
      const questionCount = isPdfQuiz ? 'PDF Quiz' : 
                          (quiz.questions && quiz.questions.length ? `${quiz.questions.length} Questions` : 'N/A');
      
      const quizHtml = `
        <div class="quiz-card ${isPdfQuiz ? 'pdf-quiz' : ''}" data-id="${quizId}">
          <div class="quiz-card-header">
            <div class="quiz-card-title">
              <h3>${quiz.title}</h3>
              <p>${quiz.description || ''}</p>
            </div>
          </div>
          <div class="quiz-card-meta">
            <span class="meta-item"><i class="fas fa-calendar-check"></i> ${formattedStartTime}</span>
            <span class="meta-item"><i class="fas fa-clock"></i> ${durationText}</span>
            <span class="meta-item">
              ${isPdfQuiz ? '<i class="fas fa-file-pdf"></i>' : '<i class="fas fa-question-circle"></i>'} 
              ${questionCount}
            </span>
            <span class="quiz-status-badge ${statusClass}">${status}</span>
          </div>
          <div class="quiz-card-actions">
            ${status === 'In Progress' ? 
              `<button class="take-quiz-btn" data-id="${quizId}">
                ${isPdfQuiz ? 'Upload Answer' : 'Take Quiz'}
              </button>` : ''}
            ${status === 'Completed' ? 
              `<button class="view-result-btn" data-id="${quizId}">View Results</button>` : ''}
            ${status === 'Upcoming' ? 
              `<button class="view-details-btn" data-id="${quizId}">View Details</button>` : ''}
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', quizHtml);
    });
    
    // Add event listeners to quiz buttons
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.getAttribute('data-id');
        const quiz = quizzes.find(q => (q.id === quizId || q._id === quizId));
        
        if (quiz && quiz.quizType === 'pdf') {
          openUploadAnswerModal(quizId);
        } else {
          openQuizInstructions(quizId);
        }
      });
    });
    
    document.querySelectorAll('.view-result-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.getAttribute('data-id');
        viewQuizResults(quizId);
      });
    });
    
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.getAttribute('data-id');
        const quiz = quizzes.find(q => (q.id === quizId || q._id === quizId));
        
        if (quiz) {
          // Display quiz details in a modal
          const modal = document.getElementById('quiz-details-modal') || createQuizDetailsModal();
          const modalContent = modal.querySelector('.modal-content');
          
          // Generate details HTML
          modalContent.innerHTML = `
            <h3>${quiz.title}</h3>
            <p>${quiz.description || 'No description provided.'}</p>
            <div class="quiz-details">
              <p><strong>Start Time:</strong> ${new Date(quiz.startTime).toLocaleString()}</p>
              <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
              <p><strong>Type:</strong> ${isPdfQuiz ? 'PDF Upload' : 'Online Quiz'}</p>
              <p><strong>Status:</strong> ${status}</p>
            </div>
            <div class="modal-actions">
              <button class="close-modal-btn">Close</button>
            </div>
          `;
          
          // Add event listener to close button
          modalContent.querySelector('.close-modal-btn').addEventListener('click', () => {
            closeModal('quiz-details-modal');
          });
          
          // Show the modal
          openModal('quiz-details-modal');
        }
      });
    });
  }
  
  // Helper function to create a quiz details modal if it doesn't exist
  function createQuizDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'quiz-details-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <!-- Content will be populated dynamically -->
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  // Load performance data
  function loadPerformanceData(performance) {
    // Remove loading indicator
    document.getElementById('loading-chart').style.display = 'none';
    
    // Check if performance data exists
    if (!performance) {
      const performanceTab = document.getElementById('performance');
      performanceTab.innerHTML = `
        <div class="no-performance-data">
          <i class="fas fa-chart-line"></i>
          <h3>No Performance Data Available</h3>
          <p>Complete some assignments or quizzes to see your performance.</p>
        </div>
      `;
      return;
    }
    
    // Set overall metrics
    document.getElementById('overall-grade').textContent = performance.overallGrade || 'N/A';
    document.getElementById('assignments-grade').textContent = performance.assignmentsGrade || 'N/A';
    document.getElementById('quizzes-grade').textContent = performance.quizzesGrade || 'N/A';
    
    // Calculate additional performance metrics
    const metrics = calculatePerformanceMetrics(performance);
    
    // Render performance dashboard
    renderPerformanceDashboard(performance, metrics);
    
    // Create performance charts
    createPerformanceCharts(performance, metrics);
  }
  
  // Calculate comprehensive performance metrics
  function calculatePerformanceMetrics(performance) {
    const metrics = {
      totalAssessments: 0,
      completedAssessments: 0,
      missedAssessments: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 100,
      recentTrend: 'stable',
      strengths: [],
      weaknesses: [],
      completionRate: 0,
      latestPerformance: null,
      categoryPerformance: {}
    };
    
    // Process assessment data for metrics
    if (performance.assessments && performance.assessments.length > 0) {
      const assessments = performance.assessments;
      metrics.totalAssessments = assessments.length;
      
      // Sort assessments by date
      const sortedAssessments = [...assessments].sort((a, b) => 
        new Date(a.date || a.dueDate || a.submissionDate) - new Date(b.date || b.dueDate || b.submissionDate)
      );
      
      // Calculate scores and find completed/missed
      let totalScorePercentage = 0;
      let completedCount = 0;
      
      assessments.forEach(assessment => {
        // Check if assessment was completed
        const isCompleted = assessment.status === 'completed' || 
                           assessment.status === 'graded' || 
                           assessment.status === 'submitted' ||
                           (assessment.score !== undefined && assessment.score !== null);
        
        if (isCompleted) {
          completedCount++;
          
          // Calculate percentage score for this assessment
          const scorePercentage = assessment.maxScore 
            ? (assessment.score / assessment.maxScore) * 100 
            : assessment.percentage || 0;
          
          totalScorePercentage += scorePercentage;
          
          // Track highest and lowest scores
          metrics.highestScore = Math.max(metrics.highestScore, scorePercentage);
          metrics.lowestScore = Math.min(metrics.lowestScore, scorePercentage);
          
          // Track performance by category
          const category = assessment.category || assessment.type || 'Other';
          if (!metrics.categoryPerformance[category]) {
            metrics.categoryPerformance[category] = {
              count: 0,
              totalScore: 0,
              averageScore: 0
            };
          }
          
          metrics.categoryPerformance[category].count++;
          metrics.categoryPerformance[category].totalScore += scorePercentage;
          metrics.categoryPerformance[category].averageScore = 
            metrics.categoryPerformance[category].totalScore / metrics.categoryPerformance[category].count;
        } else {
          // Count missed assessments
          if (new Date(assessment.dueDate) < new Date()) {
            metrics.missedAssessments++;
          }
        }
      });
      
      // Calculate completion rate
      metrics.completedAssessments = completedCount;
      metrics.completionRate = metrics.totalAssessments > 0 
        ? (completedCount / metrics.totalAssessments) * 100 
        : 0;
      
      // Calculate average score
      metrics.averageScore = completedCount > 0 
        ? totalScorePercentage / completedCount 
        : 0;
      
      // Determine recent trend (last 3 assessments if available)
      if (sortedAssessments.length >= 3) {
        const recent = sortedAssessments.slice(-3).filter(a => 
          a.status === 'completed' || a.status === 'graded' || a.status === 'submitted'
        );
        
        if (recent.length >= 2) {
          const recentScores = recent.map(a => {
            return a.maxScore ? (a.score / a.maxScore) * 100 : a.percentage || 0;
          });
          
          // Simple trend analysis
          const firstScores = recentScores.slice(0, Math.floor(recentScores.length / 2));
          const lastScores = recentScores.slice(Math.floor(recentScores.length / 2));
          
          const firstAvg = firstScores.reduce((a, b) => a + b, 0) / firstScores.length;
          const lastAvg = lastScores.reduce((a, b) => a + b, 0) / lastScores.length;
          
          if (lastAvg > firstAvg + 5) {
            metrics.recentTrend = 'improving';
          } else if (lastAvg < firstAvg - 5) {
            metrics.recentTrend = 'declining';
          } else {
            metrics.recentTrend = 'stable';
          }
        }
      }
      
      // Find strengths and weaknesses (top and bottom categories)
      const categories = Object.keys(metrics.categoryPerformance);
      if (categories.length > 0) {
        const sortedCategories = categories.sort((a, b) => 
          metrics.categoryPerformance[b].averageScore - metrics.categoryPerformance[a].averageScore
        );
        
        metrics.strengths = sortedCategories.slice(0, 2);
        metrics.weaknesses = sortedCategories.slice(-2).reverse();
      }
      
      // Get latest assessment with score
      const completedAssessments = sortedAssessments.filter(a => 
        (a.score !== undefined && a.score !== null) || a.status === 'graded'
      );
      
      if (completedAssessments.length > 0) {
        metrics.latestPerformance = completedAssessments[completedAssessments.length - 1];
      }
    }
    
    return metrics;
  }
  
  // Render performance dashboard with metrics
  function renderPerformanceDashboard(performance, metrics) {
    // Get the performance tab content container
    const performanceTab = document.getElementById('performance');
    
    // Create HTML structure for the dashboard
    const dashboardHTML = `
      <div class="performance-dashboard">
        <div class="performance-overview">
          <div class="overview-header">
            <h2>My Academic Performance</h2>
            <div class="last-updated">Last updated: ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="overview-cards">
            <div class="overview-card">
              <div class="card-icon"><i class="fas fa-graduation-cap"></i></div>
              <div class="card-content">
                <div class="card-title">Overall Grade</div>
                <div class="card-value" id="overall-grade">
                  ${getGradeIndicator(metrics.averageScore)}
                  ${performance.overallGrade || getLetterGrade(metrics.averageScore)}
                </div>
              </div>
            </div>
            <div class="overview-card">
              <div class="card-icon"><i class="fas fa-tasks"></i></div>
              <div class="card-content">
                <div class="card-title">Assignments</div>
                <div class="card-value" id="assignments-grade">
                  ${getGradeIndicator(getGradeValue(performance.assignmentsGrade))}
                  ${performance.assignmentsGrade || 'N/A'}
                </div>
              </div>
            </div>
            <div class="overview-card">
              <div class="card-icon"><i class="fas fa-question-circle"></i></div>
              <div class="card-content">
                <div class="card-title">Quizzes & Exams</div>
                <div class="card-value" id="quizzes-grade">
                  ${getGradeIndicator(getGradeValue(performance.quizzesGrade))}
                  ${performance.quizzesGrade || 'N/A'}
                </div>
              </div>
            </div>
            <div class="overview-card">
              <div class="card-icon"><i class="fas fa-chart-line"></i></div>
              <div class="card-content">
                <div class="card-title">Average Score</div>
                <div class="card-value">${metrics.averageScore.toFixed(1)}%</div>
              </div>
            </div>
          </div>
          
          <div class="progress-section">
            <div class="progress-header">
              <h3>Your Progress</h3>
            </div>
            <div class="progress-metrics">
              <div class="progress-metric">
                <div class="metric-label">Completion Rate</div>
                <div class="progress-bar-container">
                  <div class="progress-bar" style="width: ${metrics.completionRate}%"></div>
                </div>
                <div class="metric-value">${metrics.completionRate.toFixed(0)}%</div>
              </div>
              
              <div class="progress-metric">
                <div class="metric-label">Assessments</div>
                <div class="metric-counts">
                  <span class="count-item"><i class="fas fa-check text-success"></i> ${metrics.completedAssessments} Completed</span>
                  <span class="count-item"><i class="fas fa-times text-danger"></i> ${metrics.missedAssessments} Missed</span>
                  <span class="count-item"><i class="fas fa-calendar"></i> ${metrics.totalAssessments - metrics.completedAssessments - metrics.missedAssessments} Upcoming</span>
                </div>
              </div>
              
              <div class="progress-metric">
                <div class="metric-label">Performance Trend</div>
                <div class="trend-indicator trend-${metrics.recentTrend}">
                  <i class="fas fa-${metrics.recentTrend === 'improving' ? 'arrow-up' : metrics.recentTrend === 'declining' ? 'arrow-down' : 'equals'}"></i>
                  ${metrics.recentTrend === 'improving' ? 'Improving' : metrics.recentTrend === 'declining' ? 'Needs improvement' : 'Consistent'}
                </div>
              </div>
            </div>
            
            <!-- Grade distribution legend -->
            <div class="grade-distribution">
              <div class="grade-item">
                <div class="grade-marker grade-a"></div>
                <span>A (90-100%)</span>
              </div>
              <div class="grade-item">
                <div class="grade-marker grade-b"></div>
                <span>B (80-89%)</span>
              </div>
              <div class="grade-item">
                <div class="grade-marker grade-c"></div>
                <span>C (70-79%)</span>
              </div>
              <div class="grade-item">
                <div class="grade-marker grade-d"></div>
                <span>D (60-69%)</span>
              </div>
              <div class="grade-item">
                <div class="grade-marker grade-f"></div>
                <span>F (0-59%)</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Class Comparison Section (if data available) -->
        ${performance.classAverages ? renderClassComparison(performance, metrics) : ''}
        
        <div class="performance-charts-container">
          <div class="chart-section">
            <h3>Performance by Assessment</h3>
            <div class="chart-container">
              <canvas id="performanceChart"></canvas>
            </div>
          </div>
          
          <div class="chart-section">
            <h3>Performance by Category</h3>
            <div class="chart-container">
              <canvas id="categoryChart"></canvas>
            </div>
          </div>
        </div>
        
        <!-- Assessment Timeline -->
        ${renderAssessmentTimeline(performance.assessments || [])}
        
        <div class="performance-insights">
          <h3>Performance Insights</h3>
          
          <div class="insights-grid">
            <div class="insight-card">
              <h4><i class="fas fa-star"></i> Strengths</h4>
              <ul class="strengths-list">
                ${metrics.strengths.length > 0 ? 
                  metrics.strengths.map(category => 
                    `<li>
                      <span class="category-name">${category}</span>
                      <span class="category-score">${metrics.categoryPerformance[category].averageScore.toFixed(1)}%</span>
                    </li>`
                  ).join('') : 
                  '<li>Not enough data to determine strengths</li>'
                }
              </ul>
            </div>
            
            <div class="insight-card">
              <h4><i class="fas fa-exclamation-triangle"></i> Areas for Improvement</h4>
              <ul class="weaknesses-list">
                ${metrics.weaknesses.length > 0 ? 
                  metrics.weaknesses.map(category => 
                    `<li>
                      <span class="category-name">${category}</span>
                      <span class="category-score">${metrics.categoryPerformance[category].averageScore.toFixed(1)}%</span>
                    </li>`
                  ).join('') : 
                  '<li>Not enough data to determine areas for improvement</li>'
                }
              </ul>
            </div>
            
            <div class="insight-card">
              <h4><i class="fas fa-medal"></i> Personal Bests</h4>
              <div class="personal-bests">
                <div class="best-item">
                  <span class="best-label">Highest Score</span>
                  <span class="best-value">${metrics.highestScore.toFixed(1)}%</span>
                </div>
                ${metrics.latestPerformance ? 
                  `<div class="best-item">
                    <span class="best-label">Latest Assessment</span>
                    <span class="best-value">${metrics.latestPerformance.title || 'Untitled'}: ${metrics.latestPerformance.score}/${metrics.latestPerformance.maxScore}</span>
                  </div>` : ''
                }
                <div class="best-item">
                  <span class="best-label">Current Streak</span>
                  <span class="best-value">${calculateCompletionStreak(performance.assessments || [])} days</span>
                </div>
              </div>
            </div>
            
            <div class="insight-card">
              <h4><i class="fas fa-graduation-cap"></i> Overall Summary</h4>
              <div class="summary-text">
                ${generatePerformanceSummary(metrics)}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Study Time Tracking Section -->
        ${renderStudyTimeSection(performance, metrics)}
        
        <!-- Achievement Badges Section -->
        ${renderAchievementBadges(metrics)}
        
        <div class="recent-assessments">
          <h3>Recent Assessments</h3>
          <div class="assessment-list">
            ${renderRecentAssessments(performance.assessments || [])}
          </div>
        </div>
        
        <!-- Print or Export Button -->
        <button class="print-report-btn" onclick="printPerformanceReport()">
          <i class="fas fa-file-export"></i> Export Performance Report
        </button>
      </div>
    `;
    
    // Replace the existing content with the new dashboard
    performanceTab.innerHTML = dashboardHTML;
  }
  
  // Helper function to get a color-coded grade indicator
  function getGradeIndicator(score) {
    if (!score || isNaN(score)) return '';
    
    let color;
    if (score >= 90) {
      color = '#34a853'; // A grade - green
    } else if (score >= 80) {
      color = '#4285f4'; // B grade - blue
    } else if (score >= 70) {
      color = '#f9ab00'; // C grade - yellow
    } else if (score >= 60) {
      color = '#fa8e48'; // D grade - orange
    } else {
      color = '#ea4335'; // F grade - red
    }
    
    return `<span class="grade-indicator" style="background-color: ${color}"></span>`;
  }
  
  // Helper function to convert a letter grade to a numeric value
  function getGradeValue(grade) {
    if (!grade) return 0;
    
    // Handle numeric grades
    if (!isNaN(parseFloat(grade))) {
      return parseFloat(grade);
    }
    
    // Handle letter grades
    const letterGrades = {
      'A+': 97, 'A': 95, 'A-': 90,
      'B+': 87, 'B': 85, 'B-': 80,
      'C+': 77, 'C': 75, 'C-': 70,
      'D+': 67, 'D': 65, 'D-': 60,
      'F': 50
    };
    
    return letterGrades[grade] || 0;
  }
  
  // Helper function to convert a numeric score to a letter grade
  function getLetterGrade(score) {
    if (!score || isNaN(score)) return 'N/A';
    
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
  }
  
  // Render class comparison section
  function renderClassComparison(performance, metrics) {
    // If no class averages data, return empty string
    if (!performance.classAverages) return '';
    
    return `
      <div class="class-comparison">
        <h3>Compare with Class Average</h3>
        <div class="comparison-chart-container">
          <canvas id="comparisonChart"></canvas>
        </div>
        <div class="comparison-legend">
          <div class="legend-item">
            <div class="legend-color your-score-color"></div>
            <span>Your Score</span>
          </div>
          <div class="legend-item">
            <div class="legend-color class-avg-color"></div>
            <span>Class Average</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Render assessment timeline
  function renderAssessmentTimeline(assessments) {
    if (!assessments || assessments.length === 0) return '';
    
    // Sort assessments by date
    const sortedAssessments = [...assessments].sort((a, b) => {
      const dateA = new Date(a.date || a.dueDate || a.submissionDate || 0);
      const dateB = new Date(b.date || b.dueDate || b.submissionDate || 0);
      return dateA - dateB;
    });
    
    // Get earliest and latest dates
    const earliestDate = new Date(sortedAssessments[0].date || sortedAssessments[0].dueDate || sortedAssessments[0].submissionDate);
    const latestDate = new Date(sortedAssessments[sortedAssessments.length - 1].date || 
                               sortedAssessments[sortedAssessments.length - 1].dueDate || 
                               sortedAssessments[sortedAssessments.length - 1].submissionDate);
    
    // Calculate timespan in days
    const timespan = Math.ceil((latestDate - earliestDate) / (1000 * 60 * 60 * 24));
    
    // Generate timeline markers HTML
    const markersHTML = sortedAssessments.map(assessment => {
      const date = new Date(assessment.date || assessment.dueDate || assessment.submissionDate);
      const daysSinceStart = Math.ceil((date - earliestDate) / (1000 * 60 * 60 * 24));
      const position = (daysSinceStart / timespan) * 100;
      
      const type = assessment.type || (assessment.questions ? 'quiz' : 'assignment');
      const status = assessment.status || 'pending';
      
      return `
        <div class="timeline-marker ${type} ${status}" style="left: ${position}%;" 
             title="${assessment.title}: ${date.toLocaleDateString()}">
          <div class="timeline-label ${position < 50 ? 'top' : 'bottom'}">
            ${assessment.title.length > 10 ? assessment.title.substring(0, 8) + '...' : assessment.title}
          </div>
        </div>
      `;
    });
    
    return `
      <div class="assessment-timeline">
        <h3>Assessment Timeline</h3>
        <div class="timeline-track">
          ${markersHTML.join('')}
        </div>
        <div class="timeline-dates">
          <span style="float: left;">${earliestDate.toLocaleDateString()}</span>
          <span style="float: right;">${latestDate.toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }
  
  // Render study time tracking section
  function renderStudyTimeSection(performance, metrics) {
    // This section would normally use actual study time data, but we'll create a placeholder
    // with sample data for demonstration purposes
    
    // Sample data - in a real implementation, this would come from the backend
    const studyTimeData = {
      weekly: [12, 8, 15, 10, 9, 14, 6],
      totalHours: 74,
      averagePerWeek: 10.5,
      mostProductiveDay: 'Wednesday'
    };
    
    return `
      <div class="study-time-section">
        <div class="study-time-header">
          <h3>Study Time Tracking</h3>
          <div class="study-time-filters">
            <select id="study-time-period">
              <option value="week">This Week</option>
              <option value="month" selected>This Month</option>
              <option value="semester">This Semester</option>
            </select>
          </div>
        </div>
        
        <div class="study-time-chart">
          <canvas id="studyTimeChart"></canvas>
        </div>
        
        <div class="time-stats">
          <div class="time-stat">
            <span class="time-stat-label">Total Study Hours</span>
            <span class="time-stat-value">${studyTimeData.totalHours}</span>
          </div>
          <div class="time-stat">
            <span class="time-stat-label">Weekly Average</span>
            <span class="time-stat-value">${studyTimeData.averagePerWeek}</span>
          </div>
          <div class="time-stat">
            <span class="time-stat-label">Most Productive</span>
            <span class="time-stat-value">${studyTimeData.mostProductiveDay}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Render achievement badges section
  function renderAchievementBadges(metrics) {
    // Define the badges with criteria
    const badges = [
      {
        name: "Perfect Score",
        icon: "fas fa-star",
        description: "Achieved 100% on an assessment",
        unlocked: metrics.highestScore >= 100
      },
      {
        name: "All A's",
        icon: "fas fa-award",
        description: "Maintained an A average",
        unlocked: metrics.averageScore >= 90
      },
      {
        name: "Perfect Attendance",
        icon: "fas fa-calendar-check",
        description: "Completed all assessments on time",
        unlocked: metrics.completionRate >= 100 && metrics.missedAssessments === 0
      },
      {
        name: "Rising Star",
        icon: "fas fa-chart-line",
        description: "Improved consistently over time",
        unlocked: metrics.recentTrend === 'improving'
      },
      {
        name: "Quick Learner",
        icon: "fas fa-bolt",
        description: "Completed assessments ahead of schedule",
        unlocked: metrics.completedAssessments >= 5
      },
      {
        name: "Subject Expert",
        icon: "fas fa-book",
        description: "Mastered a specific subject area",
        unlocked: metrics.strengths.length > 0 && metrics.categoryPerformance[metrics.strengths[0]].averageScore >= 95
      }
    ];
    
    const badgesHTML = badges.map(badge => `
      <div class="badge-item">
        <div class="badge-icon ${badge.unlocked ? '' : 'locked'}">
          <i class="${badge.icon}"></i>
        </div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-description">${badge.description}</div>
      </div>
    `).join('');
    
    return `
      <div class="achievements-section">
        <h3>Achievement Badges</h3>
        <div class="badges-container">
          ${badgesHTML}
        </div>
      </div>
    `;
  }
  
  // Calculate completion streak (in days)
  function calculateCompletionStreak(assessments) {
    if (!assessments || assessments.length === 0) return 0;
    
    // This is a placeholder function - in a real implementation,
    // this would track consecutive days of activity
    
    // For demo purposes, return a value based on completed assessments
    const completedCount = assessments.filter(a => 
      a.status === 'completed' || a.status === 'graded' || a.status === 'submitted'
    ).length;
    
    return Math.min(completedCount * 3, 30); // Cap at 30 days for demo
  }
  
  // Function to print or export the performance report
  function printPerformanceReport() {
    // This would typically create a formatted PDF or open the print dialog
    window.print();
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
    
    // Keep track of attempts to load quizzes
    let attemptCount = 0;
    const maxAttempts = 3;
    
    function attemptLoadQuizzes() {
      attemptCount++;
      console.log(`Attempt ${attemptCount} to load quizzes`);
      
      // Try multiple approaches to get quizzes - the student-specific endpoint first
    fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
      .then(response => {
        if (!response.ok) {
            // If the student endpoint fails, try the general quizzes endpoint as fallback
            if (attemptCount < maxAttempts) {
              console.warn('Failed to fetch student quizzes, trying general quizzes endpoint');
              return Promise.reject('Try alternative endpoint');
            }
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
          // Successfully got data, process it
          processQuizData(data);
        })
        .catch(error => {
          if (error === 'Try alternative endpoint') {
            // Try alternative endpoint to get quizzes
            return fetch(`/api/classrooms/${classroomId}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              }
            })
              .then(response => {
                if (!response.ok) {
                  throw new Error('Failed to fetch classroom data');
                }
                return response.json();
              })
              .then(classroomData => {
                // Extract quizzes from classroom data if available
                if (classroomData && classroomData.quizzes && classroomData.quizzes.length > 0) {
                  console.log('Successfully fetched quizzes from classroom data');
                  processQuizData(classroomData.quizzes);
                } else if (attemptCount < maxAttempts) {
                  // Try third approach - get all quizzes
                  return fetch(`/api/classrooms/${classroomId}/quizzes`, {
                    headers: {
                      'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                    }
                  })
                    .then(response => {
                      if (!response.ok) {
                        throw new Error('Failed to fetch all quizzes');
                      }
                      return response.json();
                    })
                    .then(quizzesData => {
                      console.log('Successfully fetched quizzes from general endpoint');
                      processQuizData(quizzesData);
                    })
                    .catch(finalError => {
                      console.error('All attempts to fetch quizzes failed:', finalError);
                      showNoQuizzesMessage();
                    });
                } else {
                  showNoQuizzesMessage();
                }
              })
              .catch(altError => {
                console.error('Error fetching from alternative endpoints:', altError);
                showNoQuizzesMessage();
              });
          } else {
            console.error('Error loading quizzes:', error);
            showNoQuizzesMessage();
          }
        });
    }
    
    function showNoQuizzesMessage() {
      quizList.innerHTML = `
        <div class="no-quizzes">
          <i class="fas fa-exclamation-circle"></i>
          <p>We're having trouble loading your quizzes. Please try refreshing the page or notify your teacher.</p>
          <button class="retry-btn">Try Again</button>
        </div>
      `;
      quizList.querySelector('.retry-btn')?.addEventListener('click', () => {
        loadStudentQuizzes();
      });
    }
    
    function processQuizData(data) {
      try {
        // Debug: log the quizzes returned from the API
        console.log('Quizzes from API:', data.quizzes || data);
        
        // Ensure we're working with the right data structure
        let quizzes = [];
        
        // Handle various response structures
        if (Array.isArray(data.quizzes)) {
          quizzes = data.quizzes;
        } else if (Array.isArray(data)) {
          quizzes = data;
        } else if (data.classroom && Array.isArray(data.classroom.quizzes)) {
          quizzes = data.classroom.quizzes;
        } else {
          console.warn('Unexpected quiz data format', data);
          quizzes = []; // Empty array as fallback
        }
        
        // Safety check - ensure we have valid quizzes
        if (!Array.isArray(quizzes)) {
          console.warn('Quizzes is not an array, setting to empty array');
          quizzes = [];
        }
        
        // Make sure all quizzes have the serverProvidedStatus flag and valid studentStatus
        quizzes = quizzes.map(quiz => {
          // Guard against null/undefined quiz objects
          if (!quiz) {
            console.warn('Encountered null/undefined quiz in data');
            return {
              id: 'unknown-' + Math.random().toString(36).substring(2, 9),
              title: 'Unknown Quiz',
              description: 'This quiz has missing data',
              startTime: new Date().toISOString(),
              endTime: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
              studentStatus: 'upcoming',
              serverProvidedStatus: true
            };
          }
          
          // Ensure the quiz has a studentStatus field
          if (!quiz.studentStatus) {
            // Calculate status based on dates if not provided
            try {
              const now = new Date();
              const startTime = new Date(quiz.startTime || Date.now());
              const endTime = new Date(quiz.endTime || (Date.now() + 3600000)); // Default 1 hour from now
              
              if (now < startTime) {
                quiz.studentStatus = 'upcoming';
              } else if (now >= startTime && now <= endTime) {
                quiz.studentStatus = 'available';
              } else {
                quiz.studentStatus = 'missed';
              }
            } catch (dateError) {
              console.warn('Error calculating quiz dates:', dateError);
              quiz.studentStatus = 'upcoming'; // Default fallback
            }
          }
          
          // If a submission exists, mark as completed/submitted
          if (quiz.hasSubmitted || quiz.submitted) {
            quiz.studentStatus = 'submitted';
          }
          
          // Ensure all needed fields have defaults
          quiz.id = quiz.id || quiz._id || ('unknown-' + Math.random().toString(36).substring(2, 9));
          quiz.title = quiz.title || 'Untitled Quiz';
          quiz.description = quiz.description || '';
          quiz.duration = quiz.duration || 30; // Default 30 minutes
          
          // Both flags just to be safe
          quiz.serverProvidedStatus = true;
          return quiz;
        });
        
        availableQuizzes = quizzes;
        
        // Apply the "all" filter by default to show everything
        if (document.getElementById('quiz-status-filter')) {
          document.getElementById('quiz-status-filter').value = 'all';
        }
        
        renderQuizzes();
        
        // Double-check to ensure quizzes are displayed
        setTimeout(() => {
          if (quizzes.length > 0 && document.querySelectorAll('.quiz-card').length === 0) {
            console.log('No quizzes displayed after filter, showing all quizzes');
            if (document.getElementById('quiz-status-filter')) {
              document.getElementById('quiz-status-filter').value = 'all';
            }
            renderQuizzes();
          }
        }, 100);
      } catch (processingError) {
        console.error('Error processing quiz data:', processingError);
        // Show error message but with the raw data to help debugging
        quizList.innerHTML = `
          <div class="no-quizzes">
            <p>Error processing quiz data. Please try refreshing.</p>
            <button class="retry-btn">Try Again</button>
          </div>
        `;
        quizList.querySelector('.retry-btn')?.addEventListener('click', () => {
          loadStudentQuizzes();
        });
      }
    }
    
    // Start the quiz loading process
    attemptLoadQuizzes();
  }

  function renderQuizzes() {
    const quizList = document.querySelector('.quiz-list');
    if (!quizList) return;
    
    // Backup original quizzes list before applying filters
    const originalQuizzes = [...availableQuizzes];
    
    // Get the selected filter value
    const filterValue = document.getElementById('quiz-status-filter')?.value || 'all';
    console.log('Filter value:', filterValue);
    
    // Debug: log the quizzes we have available
    console.log('Available quizzes before filtering:', availableQuizzes);
    
    // Filter quizzes based on selected filter
    let filteredQuizzes = [...availableQuizzes];
    
    if (filterValue !== 'all') {
      if (filterValue === 'completed') {
        // Handle both 'completed' and 'submitted' statuses for the completed filter
        filteredQuizzes = availableQuizzes.filter(quiz => 
          quiz.studentStatus === 'completed' || quiz.studentStatus === 'submitted'
        );
      } else {
        filteredQuizzes = availableQuizzes.filter(quiz => quiz.studentStatus === filterValue);
      }
    }
    
    console.log('Filtered quizzes count:', filteredQuizzes.length);
    
    // If no quizzes match the filter, show all quizzes instead
    if (filteredQuizzes.length === 0 && availableQuizzes.length > 0) {
      console.log('No quizzes matched the filter, showing all quizzes');
      filteredQuizzes = [...availableQuizzes];
      if (document.getElementById('quiz-status-filter')) {
        document.getElementById('quiz-status-filter').value = 'all';
      }
    }
    
    // If we still have no quizzes, show a message
    if (filteredQuizzes.length === 0) {
      quizList.innerHTML = `<div class="no-quizzes">No quizzes found for this classroom.</div>`;
      return;
    }
    
    quizList.innerHTML = '';
    
    // Sort quizzes: available first, then upcoming, then completed, then missed
    const statusOrder = { 'available': 0, 'upcoming': 1, 'completed': 2, 'submitted': 2, 'missed': 3 };
    
    filteredQuizzes.sort((a, b) => {
      // First sort by status
      const aStatus = a.studentStatus || 'upcoming';
      const bStatus = b.studentStatus || 'upcoming';
      const statusDiff = (statusOrder[aStatus] || 0) - (statusOrder[bStatus] || 0);
      if (statusDiff !== 0) return statusDiff;
      
      // Then by date (newest first for available, oldest first for upcoming)
      if (aStatus === 'available' || aStatus === 'completed' || aStatus === 'submitted') {
        return new Date(b.startTime) - new Date(a.startTime);
      } else {
        return new Date(a.startTime) - new Date(b.startTime);
      }
    });
    
    // Debug: log the final quizzes we're displaying
    console.log('Final quizzes to display:', filteredQuizzes);
    
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
        'submitted': 'Completed',
        'missed': 'Missed'
      };
      
      // Default status to upcoming if not set
      const quizStatus = quiz.studentStatus || 'upcoming';
      
      // Check if quiz is PDF type
      const isPdfQuiz = quiz.quizType === 'pdf';
      
      let actionButton = '';
      
      if (quizStatus === 'available') {
        if (isPdfQuiz) {
          // For PDF quizzes, add download and upload buttons
          const token = localStorage.getItem('access_token');
          const downloadUrl = `/api/classrooms/${classroomId}/quizzes/${quiz.id}/pdf/questionPaper?token=${token}`;
          
          actionButton = `
            <div class="pdf-quiz-actions">
              <a href="${downloadUrl}" target="_blank" class="download-paper-btn">
                <i class="fas fa-download"></i> Download Question Paper
              </a>
              <button class="upload-answer-btn" data-quiz-id="${quiz.id}">
                <i class="fas fa-upload"></i> Upload Answer
              </button>
            </div>
          `;
        } else {
          // For regular quizzes, change to directly start the quiz instead of showing instructions
          actionButton = `<button class="start-quiz-direct-btn" data-quiz-id="${quiz.id}"><i class="fas fa-play"></i> Take Quiz</button>`;
        }
      } else if (quizStatus === 'upcoming') {
        actionButton = `<button class="take-quiz-btn disabled-btn" disabled><i class="fas fa-clock"></i> Not Available Yet</button>`;
      } else if (quizStatus === 'completed' || quizStatus === 'submitted') {
        actionButton = `<button class="view-results-btn" data-quiz-id="${quiz.id}"><i class="fas fa-chart-bar"></i> View Results</button>`;
      } else if (quizStatus === 'missed') {
        actionButton = `<button class="missed-quiz-btn disabled-btn" disabled><i class="fas fa-times-circle"></i> Missed</button>`;
      }
      
      // Debug button for admins/teachers
      const debugButton = localStorage.getItem('role') === 'teacher' ? 
        `<button class="quiz-debug-btn" data-quiz-id="${quiz.id}"><i class="fas fa-bug"></i> Debug</button>` : '';
      
      quizList.insertAdjacentHTML('beforeend', `
        <div class="quiz-card" data-quiz-id="${quiz.id}">
          <div class="quiz-card-header">
            <div class="quiz-card-title">
              <h3>${quiz.title}</h3>
              <p>${quiz.description || ''}</p>
            </div>
          </div>
          <div class="quiz-card-meta">
            <span class="meta-item"><i class="fas fa-calendar-check"></i> ${formattedDate} - ${formattedTime}</span>
            <span class="meta-item"><i class="fas fa-clock"></i> ${quiz.duration || 'N/A'} minutes</span>
            <span class="meta-item">
              ${quiz.quizType === 'pdf' ? '<i class="fas fa-file-pdf"></i>' : '<i class="fas fa-question-circle"></i>'} 
              ${quiz.questions && quiz.questions.length ? `${quiz.questions.length} Questions` : isPdfQuiz ? 'PDF Quiz' : 'N/A'}
            </span>
            <span class="quiz-status-badge status-${quizStatus === 'submitted' ? 'completed' : quizStatus}">${statusLabels[quizStatus] || 'Unknown'}</span>
          </div>
          <div class="quiz-card-actions">
            ${actionButton}
            ${debugButton}
          </div>
        </div>
      `);
    });
    
    // Add event listeners to take quiz buttons - changed to start-quiz-direct-btn
    document.querySelectorAll('.start-quiz-direct-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.dataset.quizId;
        const quiz = availableQuizzes.find(q => q.id === quizId);
        if (quiz) {
          startQuiz(quiz); // Directly start the quiz instead of showing instructions
        }
      });
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
    
    // Add event listeners to upload answer buttons
    document.querySelectorAll('.upload-answer-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.dataset.quizId;
        openUploadAnswerModal(quizId);
      });
    });

    // Add event listeners to debug buttons (for teachers only)
    document.querySelectorAll('.quiz-debug-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const quizId = this.dataset.quizId;
        debugQuizStatus(quizId);
      });
    });
  }

  function openQuizInstructions(quizId) {
    const quiz = availableQuizzes.find(q => q.id === quizId);
    if (!quiz) return;
    
    // Double check that quiz is available
    if (quiz.studentStatus !== 'available') {
      // Quiz is not available, show an error message
      showNotification(`This quiz is not available for taking. Status: ${quiz.studentStatus}`, 'error');
      // Refresh quiz list to ensure we have the latest status
      loadStudentQuizzes();
      return;
    }
    
    // Set current quiz
    currentQuiz = quiz;
    
    // Populate the instructions modal
    document.getElementById('quiz-title-display').textContent = quiz.title;
    document.getElementById('quiz-description-display').textContent = quiz.description;
    document.getElementById('quiz-duration-display').textContent = quiz.duration;
    
    // Check if it's a PDF quiz
    const isPdfQuiz = quiz.quizType === 'pdf';
    
    // Set question count or PDF indicator
    if (isPdfQuiz) {
      document.getElementById('quiz-questions-count').textContent = 'PDF Quiz';
    } else {
      document.getElementById('quiz-questions-count').textContent = quiz.questions ? quiz.questions.length : 'N/A';
    }
    
    const endDate = new Date(quiz.endTime);
    document.getElementById('quiz-end-time').textContent = endDate.toLocaleString();
    
    // Open the modal
    const modal = document.getElementById('quiz-instructions-modal');
    openModal(modal);
  }

  function startQuiz(quiz) {
    if (!quiz) return;
    
    // Double check that quiz is available
    if (quiz.studentStatus !== 'available') {
      // Quiz is not available, show an error message
      showNotification(`This quiz is not available for taking. Status: ${quiz.studentStatus}`, 'error');
      // Refresh quiz list to ensure we have the latest status
      loadStudentQuizzes();
      return;
    }
    
    // Check if it's a PDF quiz
    if (quiz.quizType === 'pdf') {
      // For PDF quizzes, redirect to the quiz page
      window.location.href = `/quiz?classId=${classroomId}&quizId=${quiz.id}`;
      return;
    }
    
    // For question-based quizzes, continue with the existing flow
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
    
    // Make sure quiz.questions exists before accessing its properties
    if (quiz.questions && quiz.questions.length > 0) {
      quiz.questions.forEach((question, index) => {
        navContainer.insertAdjacentHTML('beforeend', `
          <button class="question-nav-btn ${index === 0 ? 'current' : ''}" data-index="${index}">
            ${index + 1}
          </button>
        `);
      });
      
      // Display first question
      displayQuestion(0);
    } else {
      // Handle case where quiz has no questions
      showNotification('This quiz has no questions.', 'error');
      return;
    }
    
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
      },
      body: JSON.stringify({})
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.msg || `Failed to start quiz: ${response.status}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Quiz started successfully:', data);
    })
    .catch(error => {
      console.error('Error starting quiz:', error);
      
      // Close the quiz taking modal
      closeModal(document.getElementById('quiz-taking-modal'));
      
      // Stop the timer if it's running
      if (quizTimer) {
        clearInterval(quizTimer);
      }
      
      // Show the error message to the user
      showNotification(error.message || 'There was an issue starting the quiz.', 'error');
      
      // Reload quizzes to refresh their status
      loadStudentQuizzes();
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
    if (!currentQuiz || !currentQuiz.questions || !currentQuiz.questions[index]) {
      console.error('Cannot display question - quiz questions are undefined or index is invalid');
      return;
    }
    
    const question = currentQuiz.questions[index];
    activeQuestionIndex = index;
    
    // Update question display
    document.getElementById('question-number').textContent = `Question ${index + 1} of ${currentQuiz.questions.length}`;
    document.getElementById('question-text').textContent = question.text;
    
    // Generate options
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    // Make sure question.options exists
    if (question.options && Array.isArray(question.options)) {
      question.options.forEach((option, optionIndex) => {
        const isSelected = userAnswers[index] === optionIndex.toString();
        
        optionsContainer.insertAdjacentHTML('beforeend', `
          <div class="option-item ${isSelected ? 'selected' : ''}" data-option-index="${optionIndex}">
            <div class="option-radio"></div>
            <div class="option-text">${option.text}</div>
          </div>
        `);
      });
    } else {
      console.error('Question options undefined or not an array');
      optionsContainer.innerHTML = '<div class="error">Options not available for this question.</div>';
    }
    
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
    // Redirect to the quiz results page instead of showing a modal
    window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
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

  function openUploadAnswerModal(quizId) {
    const quiz = availableQuizzes.find(q => q.id === quizId);
    if (!quiz) return;
    
    // Check if a modal already exists, if not create it
    let uploadModal = document.getElementById('upload-answer-modal');
    if (!uploadModal) {
      // Create upload modal HTML
      const modalHTML = `
        <div id="upload-answer-modal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Upload Answer Paper</h3>
              <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
              <div class="quiz-info">
                <h4 id="upload-quiz-title"></h4>
                <p id="upload-quiz-description"></p>
                <div class="quiz-meta">
                  <div class="meta-item">
                    <i class="fas fa-clock"></i>
                    <span>Duration: <span id="upload-quiz-duration"></span> minutes</span>
                  </div>
                  <div class="meta-item">
                    <i class="fas fa-calendar-check"></i>
                    <span>Available until: <span id="upload-quiz-end-time"></span></span>
                  </div>
                </div>
              </div>
              
              <div class="upload-form">
                <div class="form-group">
                  <label for="answer-file">Upload your answer paper (PDF only)</label>
                  <input type="file" id="answer-file" accept=".pdf" required>
                  <p class="file-hint">Please upload your completed answer paper in PDF format</p>
                </div>
                <div id="upload-error" class="error-message" style="display:none;"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline cancel-upload-btn">Cancel</button>
              <button type="button" class="btn btn-primary submit-answer-btn">Submit Answer</button>
            </div>
          </div>
        </div>
      `;
      
      // Append modal to body
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      uploadModal = document.getElementById('upload-answer-modal');
      
      // Add event listeners for modal interaction
      uploadModal.querySelector('.close-modal').addEventListener('click', () => {
        closeModal(uploadModal);
      });
      
      uploadModal.querySelector('.cancel-upload-btn').addEventListener('click', () => {
        closeModal(uploadModal);
      });
      
      uploadModal.querySelector('.submit-answer-btn').addEventListener('click', () => {
        submitAnswerFile(quizId);
      });
    }
    
    // Populate the modal with quiz information
    document.getElementById('upload-quiz-title').textContent = quiz.title;
    document.getElementById('upload-quiz-description').textContent = quiz.description;
    document.getElementById('upload-quiz-duration').textContent = quiz.duration;
    
    const endDate = new Date(quiz.endTime);
    document.getElementById('upload-quiz-end-time').textContent = endDate.toLocaleString();
    
    // Reset error message and file input
    document.getElementById('upload-error').style.display = 'none';
    document.getElementById('answer-file').value = '';
    
    // Open the modal
    openModal(uploadModal);
  }

  function submitAnswerFile(quizId) {
    const fileInput = document.getElementById('answer-file');
    const errorDisplay = document.getElementById('upload-error');
    
    // Validate file selection
    if (!fileInput.files || fileInput.files.length === 0) {
      errorDisplay.textContent = 'Please select a file to upload';
      errorDisplay.style.display = 'block';
      return;
    }
    
    const file = fileInput.files[0];
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      errorDisplay.textContent = 'Only PDF files are accepted';
      errorDisplay.style.display = 'block';
      return;
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('answerFile', file);
    formData.append('startTime', new Date().toISOString());
    
    // Show loading state
    const submitBtn = document.querySelector('.submit-answer-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    // Submit to server
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      },
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.msg || 'Failed to submit quiz');
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Answer uploaded successfully:', data);
      
      // Close the modal
      closeModal(document.getElementById('upload-answer-modal'));
      
      // Show success notification
      showNotification('Your answer has been submitted successfully!', 'success');
      
      // Refresh quiz list to update status
      loadStudentQuizzes();
    })
    .catch(error => {
      console.error('Error uploading answer:', error);
      errorDisplay.textContent = error.message || 'Failed to upload answer. Please try again.';
      errorDisplay.style.display = 'block';
      
      // Reset button
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Answer';
    });
  }

  // Add debug function
  function debugQuizStatus(quizId) {
    // Call the debug endpoint
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/debug`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log('Debug data:', data);
      
      // Format the debug data for display using the helper
      const formattedData = `
        Server Time (IST): ${EduQuiz.parseDate(data.serverTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        Server Time (UTC): ${EduQuiz.parseDate(data.serverTimeUTC).toLocaleString('en-US', { timeZone: 'UTC' })}
        Timezone: ${data.timezone || 'IST (UTC+5:30)'}
        
        Quiz Start Time: ${EduQuiz.parseDate(data.quizStartTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        Quiz End Time: ${EduQuiz.parseDate(data.quizEndTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        Status: ${data.studentStatus}
        
        Time since start: ${data.timeSinceStartInMinutes.toFixed(2)} minutes
        Time until end: ${data.timeUntilEndInMinutes.toFixed(2)} minutes
        Time buffer: ${data.timeBufferInMinutes} minutes
        
        Conditions:
        - Before start: ${data.conditions.isBeforeStart}
        - After end: ${data.conditions.isAfterEnd}
        - During quiz: ${data.conditions.isDuringQuiz}
      `;
      
      // Create and show modal with debug info
      const modalHtml = `
        <div id="quiz-debug-modal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Quiz Debug Information</h2>
              <span class="close">&times;</span>
            </div>
            <div class="modal-body">
              <pre>${formattedData}</pre>
            </div>
            <div class="modal-footer">
              <button class="btn close-modal">Close</button>
            </div>
          </div>
        </div>
      `;
      
      // Add modal to the page
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // Get the modal
      const modal = document.getElementById('quiz-debug-modal');
      
      // Open the modal
      modal.style.display = 'block';
      
      // Close the modal when clicked on X or Close button
      modal.querySelector('.close').addEventListener('click', () => {
        modal.remove();
      });
      
      modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
      });
    })
    .catch(error => {
      console.error('Error fetching debug data:', error);
      showNotification('Error fetching debug data', 'error');
    });
  }

  // Generate a summary of student performance
  function generatePerformanceSummary(metrics) {
    if (metrics.completedAssessments === 0) {
      return 'Complete assignments and quizzes to see your performance summary.';
    }
    
    let summary = '';
    
    // Grade level description
    let gradeLevel = '';
    if (metrics.averageScore >= 90) {
      gradeLevel = 'excellent';
    } else if (metrics.averageScore >= 80) {
      gradeLevel = 'very good';
    } else if (metrics.averageScore >= 70) {
      gradeLevel = 'good';
    } else if (metrics.averageScore >= 60) {
      gradeLevel = 'satisfactory';
    } else {
      gradeLevel = 'needs improvement';
    }
    
    summary += `Your overall performance is <strong>${gradeLevel}</strong> with an average score of ${metrics.averageScore.toFixed(1)}%. `;
    
    // Completion rate
    if (metrics.completionRate < 70) {
      summary += `Your completion rate is ${metrics.completionRate.toFixed(0)}%, consider completing more assignments to improve your grade. `;
    } else if (metrics.completionRate < 100) {
      summary += `You've completed ${metrics.completionRate.toFixed(0)}% of your assessments. `;
    } else {
      summary += `Great job completing 100% of your assessments! `;
    }
    
    // Recent performance trend
    if (metrics.recentTrend === 'improving') {
      summary += `Your recent performance is showing improvement. Keep up the good work!`;
    } else if (metrics.recentTrend === 'declining') {
      summary += `Your recent performance has been declining. Consider seeking additional help in challenging areas.`;
    } else {
      summary += `Your performance has been consistent. Focus on your weaker areas to improve your overall grade.`;
    }
    
    return summary;
  }
  
  // Render a list of recent assessments
  function renderRecentAssessments(assessments) {
    if (!assessments || assessments.length === 0) {
      return '<div class="no-assessments">No recent assessments available</div>';
    }
    
    // Sort assessments by date (newest first)
    const sortedAssessments = [...assessments].sort((a, b) => {
      const dateA = new Date(a.date || a.dueDate || a.submissionDate || 0);
      const dateB = new Date(b.date || b.dueDate || b.submissionDate || 0);
      return dateB - dateA;
    });
    
    // Take only the 5 most recent assessments
    const recentAssessments = sortedAssessments.slice(0, 5);
    
    return recentAssessments.map(assessment => {
      const date = new Date(assessment.date || assessment.dueDate || assessment.submissionDate);
      const formattedDate = date.toLocaleDateString();
      
      const score = assessment.score !== undefined ? assessment.score : 'N/A';
      const maxScore = assessment.maxScore !== undefined ? assessment.maxScore : 'N/A';
      const percentage = assessment.maxScore && assessment.score !== undefined 
        ? ((assessment.score / assessment.maxScore) * 100).toFixed(1) + '%' 
        : 'N/A';
      
      const statusClass = getStatusClass(assessment.status);
      
      return `
        <div class="assessment-item">
          <div class="assessment-info">
            <div class="assessment-title">${assessment.title || 'Untitled Assessment'}</div>
            <div class="assessment-date">${formattedDate}</div>
          </div>
          <div class="assessment-score">
            <div class="score-value">${score}/${maxScore}</div>
            <div class="score-percentage">${percentage}</div>
          </div>
          <div class="assessment-status ${statusClass}">${assessment.status || 'N/A'}</div>
        </div>
      `;
    }).join('');
  }
  
  // Create performance charts
  function createPerformanceCharts(performance, metrics) {
    // Create the main performance chart if data is available
    if (performance.assessments && performance.assessments.length > 0) {
      // Remove loading indicator
      document.getElementById('loading-chart').style.display = 'none';
      
      // Get the canvas context
      const ctx = document.getElementById('performanceChart').getContext('2d');
      
      // Sort assessments by date
      const sortedAssessments = [...performance.assessments].sort((a, b) => {
        const dateA = new Date(a.date || a.dueDate || a.submissionDate || 0);
        const dateB = new Date(b.date || b.dueDate || b.submissionDate || 0);
        return dateA - dateB;
      });
      
      // Prepare data for chart
      const labels = sortedAssessments.map(assessment => {
        // Truncate long titles
        const title = assessment.title || 'Untitled';
        return title.length > 15 ? title.substring(0, 12) + '...' : title;
      });
      
      const scores = sortedAssessments.map(assessment => assessment.score || 0);
      const maxScores = sortedAssessments.map(assessment => assessment.maxScore || 100);
      
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
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleFont: {
                weight: 'bold'
              },
              callbacks: {
                title: function(tooltipItems) {
                  const index = tooltipItems[0].dataIndex;
                  return sortedAssessments[index].title || 'Untitled';
                },
                label: function(context) {
                  const index = context.dataIndex;
                  return [
                    `Score: ${scores[index]}/${maxScores[index]}`,
                    `Percentage: ${percentages[index].toFixed(1)}%`
                  ];
                }
              }
            }
          }
        }
      });
      
      // Create a chart for category performance
      const categories = Object.keys(metrics.categoryPerformance);
      if (categories.length > 0) {
        const ctxCategory = document.getElementById('categoryChart').getContext('2d');
        
        const categoryScores = categories.map(category => 
          metrics.categoryPerformance[category].averageScore);
        
        const categoryColors = categoryScores.map(score => 
          score < 60 ? 'rgba(234, 67, 53, 0.7)' :
          score < 70 ? 'rgba(251, 188, 5, 0.7)' :
          score < 80 ? 'rgba(66, 133, 244, 0.7)' :
          'rgba(52, 168, 83, 0.7)'
        );
        
        new Chart(ctxCategory, {
          type: 'polarArea',
          data: {
            labels: categories,
            datasets: [{
              data: categoryScores,
              backgroundColor: categoryColors,
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              r: {
                min: 0,
                max: 100,
                ticks: {
                  display: false
                }
              }
            },
            plugins: {
              legend: {
                position: 'right'
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const category = context.label;
                    const score = context.raw.toFixed(1);
                    const count = metrics.categoryPerformance[category].count;
                    return [`Score: ${score}%`, `Assessments: ${count}`];
                  }
                }
              }
            }
          }
        });
      }
      
      // Create class comparison chart if data is available
      if (performance.classAverages) {
        const comparisonCtx = document.getElementById('comparisonChart');
        if (comparisonCtx) {
          // Extract comparison data
          const classAvgData = extractClassComparisonData(performance, sortedAssessments);
          
          new Chart(comparisonCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: 'Your Score',
                  data: percentages,
                  borderColor: '#4285f4',
                  backgroundColor: 'rgba(66, 133, 244, 0.1)',
                  borderWidth: 2,
                  fill: true,
                  tension: 0.4,
                  pointBackgroundColor: '#4285f4',
                  pointRadius: 4
                },
                {
                  label: 'Class Average',
                  data: classAvgData,
                  borderColor: '#9aa0a6',
                  backgroundColor: 'rgba(154, 160, 166, 0.1)',
                  borderWidth: 2,
                  borderDash: [5, 5],
                  fill: true,
                  tension: 0.4,
                  pointBackgroundColor: '#9aa0a6',
                  pointRadius: 4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                mode: 'index',
                intersect: false
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  title: {
                    display: true,
                    text: 'Score (%)'
                  }
                }
              },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  titleFont: {
                    weight: 'bold'
                  }
                }
              }
            }
          });
        }
      }
      
      // Create study time chart (with sample data)
      const studyTimeCtx = document.getElementById('studyTimeChart');
      if (studyTimeCtx) {
        const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const sampleData = [12, 8, 15, 10, 9, 14, 6]; // Sample hours per day
        
        new Chart(studyTimeCtx, {
          type: 'bar',
          data: {
            labels: weekdays,
            datasets: [{
              label: 'Study Hours',
              data: sampleData,
              backgroundColor: 'rgba(66, 133, 244, 0.7)',
              borderColor: '#4285f4',
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Hours'
                }
              }
            },
            plugins: {
              legend: {
                display: false
              }
            }
          }
        });
        
        // Add event listener to update chart based on selected time period
        document.getElementById('study-time-period')?.addEventListener('change', function(e) {
          // This would normally fetch new data based on the selected period
          // For demo purposes, we'll just show different random data
          
          let newData;
          switch(e.target.value) {
            case 'week':
              newData = [5, 7, 9, 6, 8, 4, 2];
              break;
            case 'semester':
              newData = [48, 52, 63, 49, 41, 38, 31];
              break;
            case 'month':
            default:
              newData = [12, 8, 15, 10, 9, 14, 6];
          }
          
          // Update chart data
          studyTimeCtx.chart.data.datasets[0].data = newData;
          studyTimeCtx.chart.update();
        });
      }
    } else {
      // No data available
      document.getElementById('loading-chart').textContent = 'No assessment data available';
    }
  }
  
  // Extract class comparison data from performance data
  function extractClassComparisonData(performance, sortedAssessments) {
    // In a real implementation, this would match class averages to student assessments
    // For demo, we'll create plausible class average data based on student scores
    
    if (!performance.classAverages) {
      // Generate sample data if not provided
      return sortedAssessments.map(assessment => {
        const studentScore = assessment.score || 0;
        const maxScore = assessment.maxScore || 100;
        const studentPercentage = (studentScore / maxScore) * 100;
        
        // Generate a value that's somewhat close to the student's score but generally lower
        let classAverage = studentPercentage - (Math.random() * 15) - 5;
        if (Math.random() > 0.7) { // Occasionally the class average is higher
          classAverage = studentPercentage + (Math.random() * 10);
        }
        
        // Keep within bounds
        return Math.min(Math.max(classAverage, 40), 95);
      });
    } else {
      // Use provided class averages data
      return sortedAssessments.map(assessment => {
        const assessmentId = assessment.id || assessment._id;
        const classAvgData = performance.classAverages.find(avg => avg.assessmentId === assessmentId);
        
        if (classAvgData) {
          return classAvgData.averagePercentage;
        }
        
        // Fallback to a reasonable value if specific data isn't available
        const studentScore = assessment.score || 0;
        const maxScore = assessment.maxScore || 100;
        const studentPercentage = (studentScore / maxScore) * 100;
        
        return Math.max(studentPercentage - 10, 50);
      });
    }
  }
}); 