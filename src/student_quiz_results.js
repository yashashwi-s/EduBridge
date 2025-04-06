document.addEventListener('DOMContentLoaded', function() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const classId = urlParams.get('classId') || urlParams.get('class');
  const quizId = urlParams.get('quizId') || urlParams.get('quiz');
  
  // Check if we have the required parameters
  if (!classId || !quizId) {
    showError("Missing required parameters (classId or quizId)");
    return;
  }
  
  // Initialize event listeners
  initializeEventListeners();
  
  // Load the quiz results
  loadQuizResults();
  
  /**
   * Initialize all event listeners
   */
  function initializeEventListeners() {
    // Back to classroom button
    document.getElementById('back-to-classroom').addEventListener('click', function() {
      window.location.href = `/student_classroom?classId=${classId}`;
    });
    
    // Mobile sidebar toggle
    document.getElementById('hamburger').addEventListener('click', function() {
      document.querySelector('.sidebar').classList.toggle('expanded');
    });
    
    // Profile dropdown toggle
    document.querySelector('.profile-icon').addEventListener('click', function() {
      document.querySelector('.profile-dropdown').classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.profile-wrapper') && document.querySelector('.profile-dropdown.show')) {
        document.querySelector('.profile-dropdown').classList.remove('show');
      }
    });
    
    // Chatbot icon click handler
    if (document.getElementById('chatbotIcon')) {
      document.getElementById('chatbotIcon').addEventListener('click', function() {
        // If you have a chat widget, toggle it here
        if (window.toggleChatWidget) {
          window.toggleChatWidget();
        }
      });
    }
  }
  
  /**
   * Load quiz results from the API
   */
  function loadQuizResults() {
    showLoading(true);
    
    // Get user ID from localStorage
    let userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('access_token');
    
    // If no user ID in localStorage, try to extract from JWT token
    if (!userId && token) {
      try {
        // JWT tokens are in format: header.payload.signature
        // We need the payload part which is the second segment
        const base64Payload = token.split('.')[1];
        // Convert base64 to JSON
        const payload = JSON.parse(atob(base64Payload));
        
        // Get the user ID from the token (sub field is standard for subject/user ID)
        userId = payload.sub || payload.user_id || payload.id;
        
        if (userId) {
          console.log('Found user ID from JWT token:', userId);
          // Store it in localStorage for future use
          localStorage.setItem('user_id', userId);
        }
      } catch (e) {
        console.error('Failed to extract user ID from JWT token:', e);
      }
    }
    
    // Log information for debugging
    console.log('Loading quiz results with parameters:', {
      classId: classId,
      quizId: quizId,
      userId: userId,
      token: token ? token.substring(0, 10) + '...' : 'not found'
    });
    
    // Fetch student's quiz results
    fetch(`/api/classrooms/${classId}/quizzes/${quizId}/results/student`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        'X-User-ID': userId // Add user ID to headers for debugging
      }
    })
    .then(response => {
      // Check content type to avoid parsing non-JSON content
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!response.ok) {
        // For 404 errors, check if response is JSON before parsing
        if (response.status === 404 && isJson) {
          return response.json().then(data => {
            throw new Error(data.msg || 'No submission found for this quiz. You need to submit the quiz before you can view results.');
          }).catch(jsonError => {
            console.error('Error parsing 404 response as JSON:', jsonError);
            throw new Error('No submission found for this quiz. You need to submit the quiz before you can view results.');
          });
        } else {
          throw new Error(`Failed to fetch quiz results: ${response.status} ${response.statusText}`);
        }
      }
      
      if (!isJson) {
        throw new Error('The server returned a non-JSON response. Please try again later.');
      }
      
      return response.json().catch(jsonError => {
        console.error('Error parsing JSON response:', jsonError);
        throw new Error('Invalid response format from server. Please try again later.');
      });
    })
    .then(data => {
      console.log('Successfully loaded quiz results data:', data);
      // Display the results
      displayQuizResults(data);
      showLoading(false);
    })
    .catch(error => {
      console.error('Error loading quiz results:', error);
      showError(error.message);
      showLoading(false);
      
      // For JSON parsing errors, show a more specific message
      if (error.message.includes('JSON') || error.message.includes('parse') || error.message.includes('format')) {
        document.getElementById('results-container').innerHTML = `
          <div class="no-submission-message">
            <div class="icon">
              <i class="fas fa-exclamation-circle"></i>
            </div>
            <h2>Server Response Error</h2>
            <p>There was a problem with the server response format. This could happen due to:</p>
            <ul style="text-align: left; max-width: 500px; margin: 0 auto 20px auto;">
              <li>Server maintenance</li>
              <li>Network connection issues</li>
              <li>Authentication problems</li>
            </ul>
            <p style="margin-top: 10px;">Error details: ${error.message}</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
              <button id="retry-button" class="btn btn-primary">Retry</button>
              <button id="go-to-classroom" class="btn btn-outline">Return to Classroom</button>
            </div>
          </div>
        `;
        document.getElementById('results-container').style.display = 'block';
        
        // Add event listeners for buttons
        document.getElementById('retry-button').addEventListener('click', function() {
          window.location.reload();
        });
        
        document.getElementById('go-to-classroom').addEventListener('click', function() {
          window.location.href = `/student_classroom?classId=${classId}`;
        });
      }
      // If it's a "no submission found" error, display a more helpful UI
      else if (error.message.includes('No submission found') || error.message.includes('not found')) {
        document.getElementById('results-container').innerHTML = `
          <div class="no-submission-message">
            <div class="icon">
              <i class="fas fa-clipboard-list"></i>
            </div>
            <h2>Submission Issue</h2>
            <p>We couldn't find your submission for this quiz. This could happen if:</p>
            <ul style="text-align: left; max-width: 500px; margin: 0 auto 20px auto;">
              <li>You haven't submitted the quiz yet</li>
              <li>Your submission is still being processed</li>
              <li>There was an issue with your submission</li>
            </ul>
            <p style="margin-top: 10px;">User ID: ${userId || 'Not found in localStorage'}</p>
            <button id="go-to-quiz" class="btn btn-primary">Return to Classroom</button>
          </div>
        `;
        document.getElementById('results-container').style.display = 'block';
        
        // Add event listener for the button
        document.getElementById('go-to-quiz').addEventListener('click', function() {
          window.location.href = `/student_classroom?classId=${classId}`;
        });
      }
    });
  }
  
  /**
   * Display quiz results on the page
   * @param {Object} results - The quiz results data
   */
  function displayQuizResults(results) {
    // Set quiz title and description
    document.getElementById('quiz-title').textContent = results.quizTitle || 'Quiz Results';
    document.getElementById('quiz-description').textContent = results.quizDescription || 'Your results for this quiz';
    
    // Display score information
    const scorePercentage = Math.round(results.percentage * 10) / 10; // Round to 1 decimal place
    document.getElementById('score-percentage').textContent = `${scorePercentage}%`;
    document.getElementById('score-value').textContent = results.score;
    document.getElementById('max-score').textContent = results.maxScore;
    
    // Add score color class
    const scoreCircle = document.querySelector('.score-circle').parentElement;
    if (scorePercentage >= 80) {
      scoreCircle.classList.add('score-high');
    } else if (scorePercentage >= 60) {
      scoreCircle.classList.add('score-medium');
    } else {
      scoreCircle.classList.add('score-low');
    }
    
    // Format and display submission date
    if (results.submittedAt) {
      const submissionDate = new Date(results.submittedAt);
      document.getElementById('submitted-date').textContent = submissionDate.toLocaleString();
    } else {
      document.getElementById('submitted-date').textContent = 'Not recorded';
    }
    
    // Update grading status
    const gradingStatus = document.getElementById('grading-status');
    const statusText = document.getElementById('status-text');
    const statusIcon = document.querySelector('.status-icon i');
    
    if (results.isGraded) {
      statusText.textContent = 'Your submission has been graded';
      statusIcon.className = 'fas fa-clipboard-check';
      gradingStatus.classList.remove('pending');
    } else {
      statusText.textContent = 'Your submission is pending grading';
      statusIcon.className = 'fas fa-clock';
      gradingStatus.classList.add('pending');
    }
    
    // Set up PDF links
    const token = localStorage.getItem('access_token');
    
    // Try to get user ID from localStorage first, then try to extract from JWT token
    let userId = localStorage.getItem('user_id');
    
    // If still no user ID, try to extract from JWT token
    if (!userId && token) {
      try {
        const base64Payload = token.split('.')[1];
        const payload = JSON.parse(atob(base64Payload));
        userId = payload.sub || payload.user_id || payload.id;
        
        if (userId) {
          console.log('Found user ID from JWT token for PDF links:', userId);
          localStorage.setItem('user_id', userId);
        }
      } catch (e) {
        console.error('Failed to extract user ID from JWT token for PDF links:', e);
      }
    }
    
    // Log the user ID being used for links
    console.log('Setting up PDF links with user ID:', userId);
    
    // Question paper link
    const questionPaperLink = document.getElementById('question-paper-link');
    questionPaperLink.href = `/api/classrooms/${classId}/quizzes/${quizId}/pdf/questionPaper?token=${token}`;
    
    // Student submission link for PDF quizzes
    if (results.quizType === 'pdf' && results.answerFile) {
      const submissionLink = document.getElementById('submission-link');
      // Always use the direct my-submission-pdf endpoint which doesn't require userId in the URL
      const directUrlWithToken = `/api/classrooms/${classId}/quizzes/${quizId}/my-submission-pdf?token=${token}`;
      submissionLink.href = directUrlWithToken;
      document.getElementById('answer-submission-card').style.display = 'flex';
      
      console.log('Using direct submission endpoint that does not require user ID in URL');
      
      // Add error handler only if we couldn't get a userId (for debugging purposes)
      if (!userId) {
        console.warn('No user ID found in localStorage or JWT - this might affect some functionality');
        
        // Add click handler to track potential issues
        submissionLink.addEventListener('click', function(e) {
          // Don't prevent default - let the browser try the direct URL
          console.log('Attempting direct submission download without user ID');
        });
      }
    } else {
      document.getElementById('answer-submission-card').style.display = 'none';
    }
    
    // Show feedback if available
    if (results.feedback) {
      document.getElementById('feedback-content').textContent = results.feedback;
      document.getElementById('feedback-section').style.display = 'block';
    } else {
      document.getElementById('feedback-section').style.display = 'none';
    }
    
    // Show grading details if available for PDF quizzes
    if (results.quizType === 'pdf' && results.gradingDetails && results.gradingDetails.length > 0) {
      displayGradingDetails(results.gradingDetails);
      document.getElementById('grading-details-section').style.display = 'block';
    } else {
      document.getElementById('grading-details-section').style.display = 'none';
    }
    
    // Show the results container
    document.getElementById('results-container').style.display = 'block';
  }
  
  /**
   * Display detailed grading information in a table
   * @param {Array} gradingDetails - Array of question grading details
   */
  function displayGradingDetails(gradingDetails) {
    const tableBody = document.getElementById('grading-details-body');
    tableBody.innerHTML = '';
    
    gradingDetails.forEach((detail, index) => {
      const row = document.createElement('tr');
      
      // Question number
      const questionCell = document.createElement('td');
      questionCell.textContent = `Question ${detail.questionNumber || index + 1}`;
      row.appendChild(questionCell);
      
      // Student answer preview
      const answerCell = document.createElement('td');
      const answerPreview = detail.studentAnswer ? detail.studentAnswer.substring(0, 100) : 'No answer provided';
      answerCell.textContent = answerPreview + (detail.studentAnswer && detail.studentAnswer.length > 100 ? '...' : '');
      row.appendChild(answerCell);
      
      // Score
      const scoreCell = document.createElement('td');
      scoreCell.className = 'score-column';
      scoreCell.textContent = `${detail.score || 0}/${detail.maxScore || 0}`;
      row.appendChild(scoreCell);
      
      tableBody.appendChild(row);
    });
  }
  
  /**
   * Show or hide the loading spinner
   * @param {boolean} show - Whether to show or hide the loading spinner
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
   * Show an error message to the user
   * @param {string} message - The error message to display
   */
  function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `
      <div class="error-alert">
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
      </div>
    `;
    errorContainer.style.display = 'block';
    setTimeout(() => {
      errorContainer.style.opacity = '1';
    }, 10);
  }
}); 