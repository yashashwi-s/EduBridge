document.addEventListener('DOMContentLoaded', function() {
  // Initialize global variables
  const urlParams = new URLSearchParams(window.location.search);
  const classroomId = urlParams.get('classroomId');
  const quizId = urlParams.get('quizId');
  let quizData = null;
  let submissionsData = [];
  let filteredSubmissions = [];

  // Check if we have the required parameters
  if (!classroomId || !quizId) {
    showError("Missing required parameters (classroomId or quizId)");
    return;
  }

  // Initialize event listeners
  initializeEventListeners();
  
  // Load quiz results
  loadQuizResults();

  /**
   * Initialize event listeners for the page
   */
  function initializeEventListeners() {
    // Back to classroom button
    document.getElementById('back-to-classroom').addEventListener('click', function() {
      window.location.href = `/teacher_classroom?classroomId=${classroomId}`;
    });

    // Modal close buttons
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const modal = document.getElementById('grade-submission-modal');
        closeModal(modal);
      });
    });

    // Student search
    const searchInput = document.getElementById('search-students');
    searchInput.addEventListener('input', function() {
      filterSubmissions();
    });

    // Status filter
    const statusFilter = document.getElementById('status-filter');
    statusFilter.addEventListener('change', function() {
      filterSubmissions();
    });

    // Grade submission form
    const gradeForm = document.getElementById('grade-submission-form');
    gradeForm.addEventListener('submit', function(e) {
      e.preventDefault();
      submitGrade();
    });

    // Setup mobile sidebar functionality
    document.getElementById('hamburger').addEventListener('click', function() {
      document.querySelector('.sidebar').classList.toggle('expanded');
    });

    // Profile dropdown
    document.querySelector('.profile-icon').addEventListener('click', function() {
      document.querySelector('.profile-dropdown').classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
        document.querySelector('.profile-dropdown').classList.remove('show');
      }
    });
  }

  /**
   * Load quiz results from the API
   */
  function loadQuizResults() {
    showLoading(true);

    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch quiz results: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // Store the quiz data
      quizData = data;
      submissionsData = data.submissions || [];
      filteredSubmissions = [...submissionsData];

      // Display the results
      displayQuizResults(data);
      showLoading(false);
    })
    .catch(error => {
      console.error('Error loading quiz results:', error);
      showError(`Failed to load quiz results: ${error.message}`);
      showLoading(false);
    });
  }

  /**
   * Display quiz results on the page
   */
  function displayQuizResults(results) {
    // Set quiz title and description
    const quizTitle = results.quizTitle || 'Quiz Results';
    document.getElementById('quiz-title').textContent = quizTitle;
    
    const quizDescription = results.quizDescription || '';
    document.getElementById('quiz-description').textContent = quizDescription;

    // Set statistics
    document.getElementById('stat-submissions').textContent = submissionsData.length;
    
    // Calculate average score
    let totalScore = 0;
    let gradedCount = 0;
    let maxScore = 0;
    let highestScore = 0;
    let lowestScore = 100;
    
    submissionsData.forEach(submission => {
      if (submission.isGraded) {
        totalScore += submission.percentage || 0;
        gradedCount++;
        
        if ((submission.percentage || 0) > highestScore) {
          highestScore = submission.percentage || 0;
        }
        
        if ((submission.percentage || 0) < lowestScore) {
          lowestScore = submission.percentage || 0;
        }
      }
    });
    
    const averageScore = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 10) / 10 : 0;
    
    document.getElementById('stat-average').textContent = `${averageScore}%`;
    document.getElementById('stat-highest').textContent = gradedCount > 0 ? `${highestScore}%` : 'N/A';
    document.getElementById('stat-lowest').textContent = gradedCount > 0 ? `${lowestScore}%` : 'N/A';

    // Setup PDF links if it's a PDF quiz
    const isPdfQuiz = results.quizType === 'pdf';
    if (isPdfQuiz) {
      const pdfActions = document.getElementById('pdf-actions');
      pdfActions.style.display = 'block';
      
      // Add token for authentication
      const token = localStorage.getItem('access_token');
      
      // Set up question paper and answer key links
      const questionPaperLink = document.getElementById('question-paper-link');
      questionPaperLink.href = `/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/questionPaper?token=${token}`;
      
      const answerKeyLink = document.getElementById('answer-key-link');
      answerKeyLink.href = `/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/answerKey?token=${token}`;
    }

    // Render submissions
    renderSubmissionsTable(submissionsData);
  }

  /**
   * Render the submissions table
   */
  function renderSubmissionsTable(submissions) {
    const tableBody = document.getElementById('results-table-body');
    tableBody.innerHTML = '';
    
    if (submissions.length === 0) {
      document.querySelector('.table-wrapper').style.display = 'none';
      document.getElementById('no-submissions').style.display = 'block';
      return;
    }
    
    document.querySelector('.table-wrapper').style.display = 'block';
    document.getElementById('no-submissions').style.display = 'none';
    
    // Sort submissions by student name
    submissions.sort((a, b) => {
      return a.studentName.localeCompare(b.studentName);
    });
    
    submissions.forEach(submission => {
      const row = document.createElement('tr');
      
      // Format date
      const submissionDate = new Date(submission.submittedAt);
      const formattedDate = submissionDate.toLocaleString();
      
      // Create score cell
      const scoreCell = document.createElement('td');
      if (submission.isGraded) {
        scoreCell.textContent = `${submission.percentage}%`;
        scoreCell.classList.add('score-graded');
      } else {
        scoreCell.textContent = 'Not graded';
        scoreCell.classList.add('score-pending');
      }
      
      // Create view button
      const viewButton = document.createElement('button');
      viewButton.className = 'btn btn-sm btn-outline';
      viewButton.innerHTML = '<i class="fas fa-eye"></i>';
      viewButton.title = 'View submission';
      viewButton.dataset.studentId = submission.student_id;
      viewButton.addEventListener('click', function() {
        viewSubmission(submission.student_id);
      });
      
      // Create grade button
      const gradeButton = document.createElement('button');
      if (submission.isGraded) {
        gradeButton.className = 'btn btn-sm btn-graded';
        gradeButton.innerHTML = '<i class="fas fa-edit"></i>';
        gradeButton.title = 'Edit grade';
      } else {
        gradeButton.className = 'btn btn-sm btn-not-graded';
        gradeButton.innerHTML = '<i class="fas fa-check"></i>';
        gradeButton.title = 'Grade submission';
      }
      gradeButton.dataset.studentId = submission.student_id;
      gradeButton.addEventListener('click', function() {
        showGradeModal(submission.student_id);
      });
      
      // Create the row
      row.innerHTML = `
        <td>${submission.studentName}</td>
      `;
      row.appendChild(scoreCell);
      row.innerHTML += `<td>${formattedDate}</td>`;
      
      // Add view button cell
      const viewCell = document.createElement('td');
      viewCell.className = 'centered';
      viewCell.appendChild(viewButton);
      row.appendChild(viewCell);
      
      // Add grade button cell
      const gradeCell = document.createElement('td');
      gradeCell.className = 'centered';
      gradeCell.appendChild(gradeButton);
      row.appendChild(gradeCell);
      
      tableBody.appendChild(row);
    });
  }

  /**
   * Filter submissions based on search and filter criteria
   */
  function filterSubmissions() {
    const searchTerm = document.getElementById('search-students').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    
    filteredSubmissions = submissionsData.filter(submission => {
      // Filter by student name
      const nameMatch = submission.studentName.toLowerCase().includes(searchTerm);
      
      // Filter by status
      let statusMatch = true;
      if (statusFilter === 'graded') {
        statusMatch = submission.isGraded === true;
      } else if (statusFilter === 'not-graded') {
        statusMatch = submission.isGraded !== true;
      }
      
      return nameMatch && statusMatch;
    });
    
    renderSubmissionsTable(filteredSubmissions);
  }

  /**
   * View a student's submission
   */
  function viewSubmission(studentId) {
    const token = localStorage.getItem('access_token');
    const pdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/pdf?token=${token}`;
    
    // Open PDF in new tab
    window.open(pdfUrl, '_blank');
  }

  /**
   * Show the grade submission modal
   */
  function showGradeModal(studentId) {
    // Find the student submission
    const submission = submissionsData.find(sub => sub.student_id === studentId);
    if (!submission) {
      showError('Submission not found');
      return;
    }
    
    // Get references to modal elements
    const modal = document.getElementById('grade-submission-modal');
    const loadingSection = document.getElementById('grade-loading');
    const formContainer = document.getElementById('grade-form-container');
    
    // Show loading state
    loadingSection.style.display = 'flex';
    formContainer.style.display = 'none';
    
    // Show the modal
    modal.style.display = 'block';
    setTimeout(() => {
      modal.classList.add('active');
      modal.querySelector('.modal-content').style.opacity = '1';
    }, 10);
    
    // Set student information
    document.getElementById('submission-student-name').textContent = submission.studentName;
    
    // Set file information if available
    if (submission.answerFile && submission.answerFile.filename) {
      document.getElementById('submission-filename').textContent = submission.answerFile.filename;
    } else {
      document.getElementById('submission-filename').textContent = 'answer.pdf';
    }
    
    // Set PDF links
    const token = localStorage.getItem('access_token');
    const pdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/pdf?token=${token}`;
    
    document.getElementById('view-submission-pdf').href = pdfUrl;
    document.getElementById('download-submission-pdf').href = pdfUrl;
    
    // Set current score and feedback if available
    const scoreInput = document.getElementById('submission-score');
    const feedbackInput = document.getElementById('submission-feedback');
    
    if (submission.isGraded) {
      scoreInput.value = submission.score || '';
      feedbackInput.value = submission.feedback || '';
    } else {
      scoreInput.value = '';
      feedbackInput.value = '';
    }
    
    // Store the student ID in the form
    const form = document.getElementById('grade-submission-form');
    form.dataset.studentId = studentId;
    
    // Hide loading, show form
    loadingSection.style.display = 'none';
    formContainer.style.display = 'block';
  }

  /**
   * Submit the grade form
   */
  function submitGrade() {
    const form = document.getElementById('grade-submission-form');
    const studentId = form.dataset.studentId;
    const score = document.getElementById('submission-score').value;
    const feedback = document.getElementById('submission-feedback').value;
    
    if (!studentId) {
      showError('Student ID not found');
      return;
    }
    
    if (!score) {
      showError('Please enter a score');
      return;
    }
    
    // Show loading state
    const saveBtn = form.querySelector('.save-btn');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    // Submit grade to API
    fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/grade-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      },
      body: JSON.stringify({
        score: parseFloat(score),
        maxScore: 100,
        feedback: feedback
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to grade submission: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // Update the submission in the data
      const submission = submissionsData.find(sub => sub.student_id === studentId);
      if (submission) {
        submission.isGraded = true;
        submission.score = parseFloat(score);
        submission.maxScore = 100;
        submission.percentage = data.percentage || Math.round((parseFloat(score) / 100) * 100);
        submission.feedback = feedback;
      }
      
      // Close the modal
      const modal = document.getElementById('grade-submission-modal');
      closeModal(modal);
      
      // Update the table
      filterSubmissions();
      
      // Show success message
      showNotification('Submission graded successfully', 'success');
      
      // Reset button
      saveBtn.innerHTML = originalBtnText;
      saveBtn.disabled = false;
    })
    .catch(error => {
      console.error('Error grading submission:', error);
      showError(`Failed to grade submission: ${error.message}`);
      
      // Reset button
      saveBtn.innerHTML = originalBtnText;
      saveBtn.disabled = false;
    });
  }

  /**
   * Close a modal dialog
   */
  function closeModal(modal) {
    modal.classList.remove('active');
    modal.querySelector('.modal-content').style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }

  /**
   * Show or hide the loading spinner
   */
  function showLoading(show) {
    const loadingContainer = document.getElementById('loading-container');
    const resultsContainer = document.getElementById('results-container');
    
    if (show) {
      loadingContainer.style.display = 'flex';
      resultsContainer.style.display = 'none';
    } else {
      loadingContainer.style.display = 'none';
      resultsContainer.style.display = 'block';
    }
  }

  /**
   * Show an error message
   */
  function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
      </div>
    `;
    errorContainer.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
      errorContainer.style.display = 'none';
    }, 5000);
  }

  /**
   * Show a notification message
   */
  function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notificationContainer = document.querySelector('.notification-container');
    
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.className = 'notification-container';
      document.body.appendChild(notificationContainer);
    }
    
    // Create the notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Add appropriate icon
    let icon;
    switch (type) {
      case 'success':
        icon = 'fa-check-circle';
        break;
      case 'error':
        icon = 'fa-exclamation-circle';
        break;
      case 'warning':
        icon = 'fa-exclamation-triangle';
        break;
      default:
        icon = 'fa-info-circle';
    }
    
    notification.innerHTML = `
      <i class="fas ${icon}"></i>
      <span>${message}</span>
    `;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function() {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    notification.appendChild(closeBtn);
    
    // Add to the container
    notificationContainer.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 5000);
  }
}); 