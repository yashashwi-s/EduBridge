document.addEventListener('DOMContentLoaded', function() {
  // Initialize global variables
  const urlParams = new URLSearchParams(window.location.search);
  const classroomId = urlParams.get('classroomId');
  const quizId = urlParams.get('quizId');
  let quizData = null;
  let submissionsData = [];
  let filteredSubmissions = [];
  let currentStudentId = null;
  let questionGradingData = null;

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
        const gradeModal = document.getElementById('grade-submission-modal');
        const questionGradingModal = document.getElementById('question-grading-modal');
        const editQuestionGradeModal = document.getElementById('edit-question-grade-modal');
        
        closeModal(gradeModal);
        closeModal(questionGradingModal);
        closeModal(editQuestionGradeModal);
      });
    });

    // Specific cancel button for edit question grade modal
    document.querySelector('#edit-question-grade-modal .cancel-btn').addEventListener('click', function(e) {
      e.preventDefault();
      console.log("Cancel button clicked in edit question grade modal");
      closeModal(document.getElementById('edit-question-grade-modal'));
    });

    // Specific close button for edit question grade modal
    document.querySelector('#edit-question-grade-modal .close-modal').addEventListener('click', function() {
      console.log("Close button clicked in edit question grade modal");
      closeModal(document.getElementById('edit-question-grade-modal'));
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
    
    // Edit question grade form
    const editQuestionGradeForm = document.getElementById('edit-question-grade-form');
    editQuestionGradeForm.addEventListener('submit', function(e) {
      e.preventDefault();
      submitQuestionGrade();
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
      
      // Create question-wise grading button
      const questionGradingButton = document.createElement('button');
      questionGradingButton.className = 'btn btn-sm btn-outline';
      questionGradingButton.innerHTML = '<i class="fas fa-list-ol"></i>';
      questionGradingButton.title = 'Question-wise grading';
      questionGradingButton.dataset.studentId = submission.student_id;
      
      // Add debug logging directly on button click event
      questionGradingButton.onclick = function() {
        console.log("Question grading button clicked directly via onclick!");
        console.log("Student ID:", this.dataset.studentId);
      };
      
      questionGradingButton.addEventListener('click', function() {
        console.log("Question grading button click event fired!");
        showQuestionGradingModal(submission.student_id);
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
      
      // Always add both buttons, but show question grading only for auto-graded submissions
      const actionGroup = document.createElement('div');
      actionGroup.className = 'action-group';
      actionGroup.appendChild(gradeButton);
      
      // Add question grading button if auto-graded or always (for debugging)
      if (submission.autoGraded || true) { // Always show for debugging
        console.log("Adding question grading button for student:", submission.studentName);
        actionGroup.appendChild(questionGradingButton);
      }
      
      gradeCell.appendChild(actionGroup);
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
    if (!modal) return;
    
    modal.classList.remove('active');
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.style.opacity = '0';
      modalContent.style.transform = 'translateY(-20px)';
    }
    
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

  /**
   * Show the question-wise grading modal for a student
   */
  function showQuestionGradingModal(studentId) {
    console.log("Question-wise grading button clicked for student ID:", studentId);
    
    // Find the student's submission to show their marks
    const submission = submissionsData.find(sub => sub.student_id === studentId);
    if (submission) {
      const markInfo = {
        score: submission.score || 0,
        maxScore: submission.maxScore || 0,
        percentage: submission.percentage || 0,
        isGraded: submission.isGraded || false
      };
      
      console.log("Student marks:", markInfo);
    } else {
      console.log("No submission data found for this student");
    }
    
    currentStudentId = studentId;
    const modal = document.getElementById('question-grading-modal');
    
    // Show loading state
    document.getElementById('question-grading-loading').style.display = 'flex';
    document.getElementById('question-grading-container').style.display = 'none';
    
    // Show the modal with animation
    modal.style.display = 'block';
    setTimeout(() => {
      modal.classList.add('active');
      modal.querySelector('.modal-content').style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'translateY(0)';
    }, 10);
    
    // Load question-wise grading data
    loadQuestionGradingData(studentId);
  }
  
  /**
   * Load question-wise grading data for a student
   */
  function loadQuestionGradingData(studentId) {
    console.log(`Fetching question-wise grading data for student ${studentId}`);
    
    const apiUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/grading`;
    console.log("API URL:", apiUrl);
    
    fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    })
    .then(response => {
      console.log("API response status:", response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch grading details: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Received grading data:", data);
      
      // Store the grading data
      questionGradingData = data;
      
      // Display the grading details
      displayQuestionGrading(data, studentId);
    })
    .catch(error => {
      console.error('Error loading question grading:', error);
      document.getElementById('question-grading-loading').style.display = 'none';
      
      const container = document.getElementById('question-grading-container');
      container.innerHTML = `
        <div class="error-message">
          <p>Failed to load question grading details: ${error.message}</p>
        </div>
      `;
      container.style.display = 'block';
      
      // Show notification for error
      showNotification(`Failed to load question details: ${error.message}`, 'error');
    });
  }
  
  /**
   * Display question-wise grading details
   */
  function displayQuestionGrading(data, studentId) {
    // Update student info
    document.getElementById('question-grading-student-name').textContent = data.studentInfo.name || 'Student';
    
    // Update quiz score
    document.getElementById('quiz-total-score').textContent = `Score: ${data.score}/${data.maxScore}`;
    document.getElementById('quiz-percentage').textContent = `${data.percentage}%`;
    
    // Set up PDF links
    const token = localStorage.getItem('access_token');
    
    const questionPaperLink = document.getElementById('qg-question-paper-link');
    questionPaperLink.href = `/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/questionPaper?token=${token}`;
    
    const answerKeyLink = document.getElementById('qg-answer-key-link');
    answerKeyLink.href = `/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/answerKey?token=${token}`;
    
    const studentAnswersLink = document.getElementById('qg-student-answers-link');
    studentAnswersLink.href = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/answer-pdf?token=${token}`;
    
    // Render question grades table
    renderQuestionGradesTable(data.questionGradingResults);
    
    // Hide loading and show container
    document.getElementById('question-grading-loading').style.display = 'none';
    document.getElementById('question-grading-container').style.display = 'block';
  }
  
  /**
   * Render the question grades table
   */
  function renderQuestionGradesTable(questionResults) {
    const tableBody = document.getElementById('question-grades-table-body');
    tableBody.innerHTML = '';
    
    // Sort questions by number
    questionResults.sort((a, b) => {
      return a.questionNumber.localeCompare(b.questionNumber, undefined, {numeric: true});
    });
    
    questionResults.forEach(result => {
      const row = document.createElement('tr');
      
      // Calculate percentage
      const percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
      
      // Determine percentage class
      let percentageClass = '';
      if (percentage >= 80) {
        percentageClass = 'high-score';
      } else if (percentage >= 50) {
        percentageClass = 'medium-score';
      } else {
        percentageClass = 'low-score';
      }
      
      // Create status indicator
      const statusSpan = document.createElement('span');
      statusSpan.className = 'question-status';
      
      if (result.manuallyGraded) {
        statusSpan.textContent = 'Manually Graded';
        statusSpan.classList.add('status-manually-graded');
      } else {
        statusSpan.textContent = 'Auto Graded';
        statusSpan.classList.add('status-auto-graded');
      }
      
      // Create edit button
      const editButton = document.createElement('button');
      editButton.className = 'edit-question-btn';
      editButton.innerHTML = '<i class="fas fa-edit"></i> Edit';
      editButton.dataset.questionNumber = result.questionNumber;
      editButton.dataset.score = result.score;
      editButton.dataset.maxScore = result.maxScore;
      editButton.dataset.feedback = result.feedback || '';
      
      // Add debug logging directly on button click event
      editButton.onclick = function() {
        console.log("Edit question button clicked directly via onclick!");
        console.log("Question number:", this.dataset.questionNumber);
      };
      
      editButton.addEventListener('click', function() {
        console.log("Edit question button click event fired!");
        showEditQuestionGradeModal(result);
      });
      
      // Add cells to row
      row.innerHTML = `
        <td>Question ${result.questionNumber}</td>
        <td>${result.score}</td>
        <td>${result.maxScore}</td>
        <td><span class="score-percentage ${percentageClass}">${percentage}%</span></td>
      `;
      
      // Add actions cell
      const actionsCell = document.createElement('td');
      actionsCell.appendChild(statusSpan);
      actionsCell.appendChild(document.createElement('br'));
      actionsCell.appendChild(editButton);
      row.appendChild(actionsCell);
      
      tableBody.appendChild(row);
    });
  }
  
  /**
   * Show the edit question grade modal
   */
  function showEditQuestionGradeModal(questionData) {
    console.log("showEditQuestionGradeModal called with data:", questionData);
    
    const modal = document.getElementById('edit-question-grade-modal');
    console.log("Found modal element:", modal);
    
    // Set question data
    document.getElementById('edit-question-number').textContent = questionData.questionNumber;
    document.getElementById('question-score').value = questionData.score;
    document.getElementById('question-max-score').textContent = questionData.maxScore;
    document.getElementById('question-feedback').value = questionData.feedback || '';
    
    // Set max attribute on input
    document.getElementById('question-score').max = questionData.maxScore;
    
    // Store current question data
    modal.dataset.questionNumber = questionData.questionNumber;
    modal.dataset.maxScore = questionData.maxScore;
    
    // Show the modal with animation
    modal.style.display = 'block';
    console.log("Set modal display to block");
    
    setTimeout(() => {
      modal.classList.add('active');
      modal.querySelector('.modal-content').style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'translateY(0)';
      console.log("Added active class and animation styles");
    }, 10);
  }
  
  /**
   * Submit an updated question grade
   */
  function submitQuestionGrade() {
    console.log("submitQuestionGrade called");
    
    const modal = document.getElementById('edit-question-grade-modal');
    const questionNumber = modal.dataset.questionNumber;
    const maxScore = parseFloat(modal.dataset.maxScore);
    const score = parseFloat(document.getElementById('question-score').value);
    const feedback = document.getElementById('question-feedback').value;
    
    console.log("Updating grade for question:", questionNumber);
    console.log("New score:", score, "Max score:", maxScore);
    console.log("Feedback:", feedback);
    
    // Validate score
    if (isNaN(score) || score < 0 || score > maxScore) {
      showNotification(`Score must be between 0 and ${maxScore}`, 'error');
      return;
    }
    
    // Prepare data
    const gradeData = {
      questionNumber: questionNumber,
      score: score,
      feedback: feedback
    };
    
    // Disable form while submitting
    const form = document.getElementById('edit-question-grade-form');
    const saveButton = form.querySelector('.save-btn');
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    const apiUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${currentStudentId}/question-grade`;
    console.log("Sending request to:", apiUrl);
    console.log("Request data:", gradeData);
    
    // Submit update
    fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      },
      body: JSON.stringify(gradeData)
    })
    .then(response => {
      console.log("Response status:", response.status);
      if (!response.ok) {
        throw new Error(`Failed to update question grade: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Question grade updated successfully:", data);
      
      // Show success notification
      showNotification('Question grade updated successfully', 'success');
      
      // Close modal
      closeModal(modal);
      
      // Reload question grading data to show updated scores
      loadQuestionGradingData(currentStudentId);
      
      // Reload quiz results to update overall scores
      loadQuizResults();
    })
    .catch(error => {
      console.error('Error updating question grade:', error);
      showNotification(`Failed to update question grade: ${error.message}`, 'error');
    })
    .finally(() => {
      // Re-enable form
      saveButton.disabled = false;
      saveButton.innerHTML = 'Save Grade';
    });
  }
}); 