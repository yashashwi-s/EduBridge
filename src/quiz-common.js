/**
 * EduBridge Quiz - Common JavaScript Functions
 */

// Create EduQuiz namespace to expose the functions
const EduQuiz = {};

// Global variables for quiz state
let quizData = null;        // Holds the current quiz data
let classroomId = null;     // Current classroom ID
let quizId = null;          // Current quiz ID
let currentQuestion = 0;    // Index of current question
let userAnswers = {};       // Object to store user's answers
let quizTimer = null;       // Timer interval
let quizStartTime = null;   // When the user started the quiz

/**
 * Get the current classroom ID
 * @returns {string} The classroom ID
 */
EduQuiz.getClassroomId = function() {
  return classroomId;
}

/**
 * Get the current quiz ID
 * @returns {string} The quiz ID
 */
EduQuiz.getQuizId = function() {
  return quizId;
}

/**
 * Initialize a quiz page
 */
EduQuiz.initQuizPage = function() {
  // Extract IDs from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  classroomId = urlParams.get('classId');
  quizId = urlParams.get('quizId');
  
  if (!classroomId || !quizId) {
    EduQuiz.showError('Missing classroom ID or quiz ID in URL parameters.');
    return false;
  }

  // Set up UI event listeners
  EduQuiz.setupUIListeners();
  
  // Initialize quiz start time when the page loads
  quizStartTime = new Date().toISOString();
  console.log('Quiz start time initialized:', quizStartTime);
  
  return true;
}

/**
 * Setup event listeners for UI interaction
 */
EduQuiz.setupUIListeners = function() {
  // Toggle sidebar
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    const sidebar = document.querySelector('.sidebar');
    hamburger.addEventListener('click', function() {
      sidebar.classList.toggle('expanded');
    });
  }
  
  // Profile dropdown
  const profileIcon = document.querySelector('.profile-icon');
  if (profileIcon) {
    const profileDropdown = document.querySelector('.profile-dropdown');
    
    profileIcon.addEventListener('click', function(event) {
      event.stopPropagation();
      profileDropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', function() {
      profileDropdown.classList.remove('show');
    });
  }
}

/**
 * Fetch quiz data from the API
 * @param {function} callback - Function to call after successful fetch
 */
EduQuiz.fetchQuizData = function(callback) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    EduQuiz.showError('Authentication required. Please log in.');
    return;
  }

  // Clear any existing errors
  const errorContainer = document.getElementById('error-container');
  if (errorContainer) {
    errorContainer.style.display = 'none';
    errorContainer.textContent = '';
  }

  EduQuiz.showLoading(true);
  
  console.log('Checking quiz availability...');
  
  // First check if the quiz is actually available before trying to start it
  fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.msg || 'Failed to fetch quiz data');
      });
    }
    return response.json();
  })
  .then(quizzes => {
    console.log(`Found ${quizzes.length} quizzes`);
    
    const quiz = quizzes.find(q => q.id === quizId);
    
    if (!quiz) {
      EduQuiz.showError('Quiz not found.');
      return;
    }
    
    console.log('Found quiz:', quiz.title);
    console.log('Current status:', quiz.studentStatus);
    
    // Update the quiz status based on current time
    const updatedQuiz = EduQuiz.updateQuizStatus(quiz);
    
    console.log('Updated status:', updatedQuiz.studentStatus);
    
    if (updatedQuiz.studentStatus !== 'available') {
      // If quiz is not available, show appropriate message
      if (updatedQuiz.studentStatus === 'missed') {
        EduQuiz.showError('This quiz has expired and is no longer available.');
      } else if (updatedQuiz.studentStatus === 'upcoming') {
        // Format the start time
        const startTime = new Date(updatedQuiz.startTime);
        const formattedTime = startTime.toLocaleString();
        EduQuiz.showError(`This quiz is not available yet. It will start at ${formattedTime}.`);
      } else if (updatedQuiz.studentStatus === 'submitted') {
        EduQuiz.showError('You have already submitted this quiz.');
        setTimeout(() => {
          window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
        }, 2000);
      }
      
      // Redirect to details page if not available
      setTimeout(() => {
        window.location.href = `/quiz-details?classId=${classroomId}&quizId=${quizId}`;
      }, 3000);
      
      return;
    }
    
    // Only try to start the quiz if it's actually available
    EduQuiz.startQuizAfterVerification(callback);
  })
  .catch(error => {
    console.error('Error checking quiz availability:', error);
    EduQuiz.showError(error.message || 'An error occurred while fetching quiz data.');
    EduQuiz.showLoading(false);
  });
}

/**
 * Internal function to start quiz after verification
 */
EduQuiz.startQuizAfterVerification = function(callback) {
  const token = localStorage.getItem('access_token');
  
  console.log(`Starting quiz verification for quiz ID: ${quizId}`);
  
  fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    console.log('Start quiz response status:', response.status);
    
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.msg || 'Failed to start quiz');
      });
    }
    
    return response.text().then(text => {
      try {
        // Try to parse as JSON
        return JSON.parse(text);
      } catch (e) {
        // If parsing fails, log the raw text
        console.log('Raw response is not valid JSON:', text);
        return { quiz: null };
      }
    });
  })
  .then(data => {
    console.log('Start quiz response data:', data);
    
    if (data && data.quiz) {
      console.log('Quiz data received from start endpoint:', data.quiz);
      quizData = data.quiz;
      
      // If we have questions in the response, use them directly
      if (data.quiz.questions && data.quiz.questions.length > 0) {
        if (typeof callback === 'function') {
          console.log('Calling callback with quiz data from start endpoint');
          callback(data.quiz);
          EduQuiz.showLoading(false); // Ensure loading is hidden
        }
      } else {
        // Otherwise fetch questions separately
        console.log('No questions in response, fetching separately');
        EduQuiz.fetchQuizQuestions(callback);
      }
    } else {
      // Even if we don't get quiz data, try to fetch questions
      console.log('No quiz data in response, fetching questions anyway');
      EduQuiz.fetchQuizQuestions(callback);
    }
  })
  .catch(error => {
    // If there's an error (like 400 Bad Request), redirect to quiz details
    console.error('Error starting quiz:', error);
    EduQuiz.showError(`${error.message || 'Quiz cannot be started'}. Redirecting back to quiz details...`);
    
    // After 3 seconds, redirect back to quiz details
    setTimeout(() => {
      window.location.href = `/quiz-details?classId=${classroomId}&quizId=${quizId}`;
    }, 3000);
  });
}

/**
 * Fetch quiz questions after starting the quiz
 * @param {function} callback - Function to call after successful fetch
 */
EduQuiz.fetchQuizQuestions = function(callback) {
  const token = localStorage.getItem('access_token');
  
  console.log('Fetching quiz questions...');
  
  // Make sure we're showing loading state
  EduQuiz.showLoading(true);
  
  fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    console.log('Fetch questions response status:', response.status);
    
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.msg || 'Failed to fetch quiz questions');
      });
    }
    return response.json();
  })
  .then(quizzes => {
    console.log(`Received ${quizzes.length} quizzes`);
    
    // Find the current quiz
    const currentQuiz = quizzes.find(quiz => quiz.id === quizId);
    
    if (currentQuiz) {
      console.log('Found current quiz:', currentQuiz.title);
      
      // Create a backup of the quiz object in case we need to debug
      window.quizBackup = JSON.parse(JSON.stringify(currentQuiz));
      
      // Populate global quiz data
      quizData = currentQuiz;
      window.quizData = quizData;
      
      // Ensure user answers is initialized as an empty object
      userAnswers = {};
      window.userAnswers = userAnswers;
      
      // Call the callback function with the quiz data
      if (typeof callback === 'function') {
        console.log('Calling display callback with quiz data');
        try {
          callback(currentQuiz);
        } catch (error) {
          console.error('Error in quiz display callback:', error);
          EduQuiz.showError('Error displaying quiz. Please reload the page.');
        }
      }
    } else {
      console.error('Quiz not found in the response');
      EduQuiz.showError('Quiz not found');
    }
  })
  .catch(error => {
    console.error('Error fetching quiz questions:', error);
    EduQuiz.showError(error.message || 'An error occurred while fetching quiz data.');
  })
  .finally(() => {
    // Make sure loading is hidden once we're done
    EduQuiz.showLoading(false);
  });
}

/**
 * Fetch quiz results from the server
 * @param {function} callback - Function to call with results data
 */
EduQuiz.fetchQuizResults = function(callback) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    EduQuiz.showError('Authentication required. Please log in.');
    return;
  }

  console.log(`Fetching quiz results for quiz ID: ${quizId}`);
  EduQuiz.showLoading(true);

  fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results/student`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    console.log('Results response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 404) {
        EduQuiz.showError('You have not submitted this quiz yet.');
        setTimeout(() => {
          window.location.href = `/quiz-details?classId=${classroomId}&quizId=${quizId}`;
        }, 2000);
        return null;
      }
      
      return response.json().then(data => {
        throw new Error(data.msg || 'Failed to fetch results');
      });
    }
    
    return response.json();
  })
  .then(data => {
    if (!data) return; // If we got a 404 earlier, skip processing
    
    console.log('Results data:', data);
    
    if (typeof callback === 'function') {
      EduQuiz.showLoading(false);
      callback(data);
    }
  })
  .catch(error => {
    console.error('Error fetching results:', error);
    EduQuiz.showError(error.message || 'An error occurred while fetching quiz results.');
    EduQuiz.showLoading(false);
  });
}

/**
 * Load quiz details page with quiz information
 */
EduQuiz.loadQuizDetails = function() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    EduQuiz.showError('Authentication required. Please log in.');
    return;
  }

  console.log(`Loading details for quiz ID: ${quizId}`);
  EduQuiz.showLoading(true);

  // Log all elements to help with debugging
  console.log('Available elements for quiz details page:');
  console.log('details-container:', document.getElementById('details-container'));
  console.log('quiz-title:', document.getElementById('quiz-title'));
  console.log('quiz-description:', document.getElementById('quiz-description'));
  console.log('start-time:', document.getElementById('start-time'));
  console.log('end-time:', document.getElementById('end-time'));
  console.log('duration:', document.getElementById('duration'));
  console.log('quiz-question-count:', document.getElementById('quiz-question-count'));
  console.log('status-badge:', document.getElementById('status-badge'));
  console.log('start-quiz:', document.getElementById('start-quiz'));
  console.log('view-results:', document.getElementById('view-results'));
  console.log('back-button:', document.getElementById('back-button'));

  // First try to fetch student's quiz results if available
  fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/results/student`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (response.ok) {
      // Student has results, get them
      return response.json().then(results => {
        console.log('Student has results for this quiz:', results);
        displayQuizWithResults(results);
      });
    } else {
      // Student doesn't have results, just show the quiz details
      return fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.msg || 'Failed to fetch quiz details');
          });
        }
        return response.json();
      })
      .then(quizzes => {
        const quiz = quizzes.find(q => q.id === quizId);
        if (!quiz) {
          throw new Error('Quiz not found');
        }
        console.log('Found quiz details:', quiz);
        
        // Update status based on current time
        const updatedQuiz = EduQuiz.updateQuizStatus(quiz);
        displayQuizDetails(updatedQuiz);
      });
    }
  })
  .catch(error => {
    console.error('Error loading quiz details:', error);
    EduQuiz.showError(error.message || 'An error occurred while loading quiz details.');
    EduQuiz.showLoading(false);
  });
  
  // Function to display quiz details
  function displayQuizDetails(quiz) {
    const detailsContainer = document.getElementById('details-container');
    if (!detailsContainer) {
      console.error('Details container not found in the DOM');
      return;
    }
    
    // Fill in quiz details
    document.getElementById('quiz-title').textContent = quiz.title;
    document.getElementById('quiz-description').textContent = quiz.description || 'No description provided';
    
    // Format dates
    const startDate = new Date(quiz.startTime);
    const endDate = new Date(quiz.endTime);
    
    document.getElementById('start-time').textContent = startDate.toLocaleString();
    document.getElementById('end-time').textContent = endDate.toLocaleString();
    document.getElementById('duration').textContent = `${quiz.duration} minutes`;
    
    // Set question count if element exists
    const questionCountElement = document.getElementById('quiz-question-count');
    if (questionCountElement) {
      questionCountElement.textContent = quiz.questions ? quiz.questions.length : '0';
    }
    
    // Set status badge
    const statusBadge = document.getElementById('status-badge');
    if (statusBadge) {
      // Clear existing classes
      statusBadge.className = 'status-badge';
      statusBadge.classList.add(quiz.studentStatus);
      
      // Set status text
      const statusMap = {
        'available': 'Available',
        'upcoming': 'Upcoming',
        'submitted': 'Completed',
        'missed': 'Missed'
      };
      statusBadge.textContent = statusMap[quiz.studentStatus] || quiz.studentStatus;
    }
    
    // Set button visibility and behavior
    const startQuizButton = document.getElementById('start-quiz');
    if (startQuizButton) {
      if (quiz.studentStatus === 'available') {
        startQuizButton.style.display = 'inline-block';
        startQuizButton.addEventListener('click', function() {
          window.location.href = `/quiz?classId=${classroomId}&quizId=${quizId}`;
        });
      } else {
        startQuizButton.style.display = 'none';
      }
    }
    
    const viewResultsButton = document.getElementById('view-results');
    if (viewResultsButton) {
      if (quiz.studentStatus === 'submitted') {
        viewResultsButton.style.display = 'inline-block';
        viewResultsButton.addEventListener('click', function() {
          window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
        });
      } else {
        viewResultsButton.style.display = 'none';
      }
    }
    
    // Show the details container
    detailsContainer.style.display = 'block';
    EduQuiz.showLoading(false);
  }
  
  // Function to display quiz with results
  function displayQuizWithResults(results) {
    const detailsContainer = document.getElementById('details-container');
    if (!detailsContainer) {
      console.error('Details container not found in the DOM');
      return;
    }
    
    // Fill in quiz details from results
    document.getElementById('quiz-title').textContent = results.quizTitle || 'Quiz Results';
    document.getElementById('quiz-description').textContent = results.quizDescription || 'No description provided';
    
    // Format dates if available
    const startDate = results.startTime ? new Date(results.startTime) : new Date();
    const endDate = results.endTime ? new Date(results.endTime) : new Date();
    
    document.getElementById('start-time').textContent = startDate.toLocaleString();
    document.getElementById('end-time').textContent = endDate.toLocaleString();
    document.getElementById('duration').textContent = `${results.duration || 0} minutes`;
    
    // Set question count if element exists
    const questionCountElement = document.getElementById('quiz-question-count');
    if (questionCountElement) {
      questionCountElement.textContent = results.totalQuestions || '0';
    }
    
    // Set status badge to completed
    const statusBadge = document.getElementById('status-badge');
    if (statusBadge) {
      statusBadge.className = 'status-badge submitted';
      statusBadge.textContent = 'Completed';
    }
    
    // Show result summary
    const resultSummary = document.createElement('div');
    resultSummary.className = 'result-summary';
    resultSummary.innerHTML = `
      <h3>Your Results</h3>
      <div class="result-score">Score: ${results.percentage || 0}%</div>
      <div class="result-correct">Correct: ${results.correctCount || 0} out of ${results.totalQuestions || 0}</div>
    `;
    
    // Check if result summary already exists and remove it if so
    const existingResultSummary = detailsContainer.querySelector('.result-summary');
    if (existingResultSummary) {
      existingResultSummary.remove();
    }
    
    // Add summary to the page
    const actionsElement = detailsContainer.querySelector('.actions');
    if (actionsElement) {
      actionsElement.before(resultSummary);
    } else {
      detailsContainer.appendChild(resultSummary);
    }
    
    // Hide start quiz button
    const startQuizButton = document.getElementById('start-quiz');
    if (startQuizButton) {
      startQuizButton.style.display = 'none';
    }
    
    // Show view results button
    const viewResultsButton = document.getElementById('view-results');
    if (viewResultsButton) {
      viewResultsButton.style.display = 'inline-block';
      viewResultsButton.addEventListener('click', function() {
        window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
      });
    }
    
    // Show the details container
    detailsContainer.style.display = 'block';
    EduQuiz.showLoading(false);
  }
}

/**
 * Fetch quiz details before taking the quiz
 * @param {function} callback - Function to call after successful fetch
 */
EduQuiz.fetchQuizDetails = function(callback) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    EduQuiz.showError('Authentication required. Please log in.');
    return;
  }

  EduQuiz.showLoading(true);
  
  fetch(`/api/classrooms/${classroomId}/quizzes/student`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.msg || 'Failed to fetch quiz details');
      });
    }
    return response.json();
  })
  .then(quizzes => {
    const currentQuiz = quizzes.find(quiz => quiz.id === quizId);
    if (currentQuiz) {
      // Check if the quiz status needs to be updated based on current time
      EduQuiz.updateQuizStatus(currentQuiz);
      
      if (typeof callback === 'function') {
        callback(currentQuiz);
      }
    } else {
      EduQuiz.showError('Quiz not found');
    }
  })
  .catch(error => {
    EduQuiz.showError(error.message || 'An error occurred while fetching quiz details.');
  })
  .finally(() => {
    EduQuiz.showLoading(false);
  });
}

/**
 * Update quiz status based on current time
 * @param {object} quiz - Quiz object to update
 */
EduQuiz.updateQuizStatus = function(quiz) {
  // Use current time in UTC
  const now = new Date();
  
  try {
    // Parse date strings into Date objects
    const startTime = new Date(quiz.startTime);
    const endTime = new Date(quiz.endTime);
    
    // Log timestamps for debugging
    console.log('Checking quiz status:', {
      now: now.toISOString(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      quizTitle: quiz.title,
      currentStatus: quiz.studentStatus
    });
    
    // Keep submitted status if already submitted
    if (quiz.studentStatus === 'submitted') {
      console.log(`Quiz ${quiz.title} already submitted, status unchanged`);
      return quiz;
    }
    
    // Determine status based on time comparison
    if (now < startTime) {
      // Quiz hasn't started yet
      quiz.studentStatus = 'upcoming';
      console.log(`Quiz ${quiz.title} marked as upcoming - starts at ${startTime.toLocaleString()}`);
    } else if (now > endTime) {
      // Quiz has ended
      quiz.studentStatus = 'missed';
      console.log(`Quiz ${quiz.title} marked as missed - ended at ${endTime.toLocaleString()}`);
    } else {
      // Quiz is currently active
      quiz.studentStatus = 'available';
      console.log(`Quiz ${quiz.title} marked as available - running from ${startTime.toLocaleString()} to ${endTime.toLocaleString()}`);
    }
  } catch (error) {
    console.error('Error updating quiz status:', error);
    // Don't default to available if there's an error, keep existing status
    console.log(`Error processing quiz status, using existing status: ${quiz.studentStatus || 'none'}`);
  }
  
  return quiz;
}

/**
 * Submit quiz answers to the server
 */
EduQuiz.submitQuizAnswers = function() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    EduQuiz.showError('Authentication required. Please log in.');
    return;
  }

  // Get answers from window object to ensure we have the most up-to-date answers
  const answers = window.userAnswers || {};
  
  // Log the answers for debugging
  console.log('Submitting answers:', answers);
  console.log('Quiz data:', window.quizData);
  console.log('Quiz start time:', quizStartTime);
  
  // Check if we're already in the process of submitting
  if (window.isSubmitting) {
    console.log('Submission already in progress, ignoring duplicate request');
    return;
  }
  
  // Set submission flag
  window.isSubmitting = true;
  
  // Disable submit button if it exists
  const submitButton = document.getElementById('submit-quiz');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  }
  
  // Check if any answers are provided
  if (Object.keys(answers).length === 0) {
    if (!confirm('You have not answered any questions. Do you still want to submit?')) {
      EduQuiz.showLoading(false);
      // Reset submission flag
      window.isSubmitting = false;
      // Re-enable submit button
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Submit Quiz';
      }
      return;
    }
  }

  EduQuiz.showLoading(true);
  
  // Close the confirmation modal if it's open
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'none';
  
  // Add debugging in the console
  console.log('Submitting quiz to endpoint:', `/api/classrooms/${classroomId}/quizzes/${quizId}/submit`);
  console.log('With answers payload:', {
    answers: answers,
    startTime: quizStartTime || new Date().toISOString() 
  });
  
  // Make the fetch request
  fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      answers: answers,
      startTime: quizStartTime || new Date().toISOString() // Fallback in case quizStartTime is not set
    })
  })
  .then(response => {
    console.log('Submit response status:', response.status);
    // Log the raw response for debugging
    return response.text().then(text => {
      try {
        // Try to parse as JSON
        const data = JSON.parse(text);
        console.log('Submit response data:', data);
        
        if (!response.ok) {
          throw new Error(data.msg || 'Failed to submit quiz');
        }
        
        return data;
      } catch (e) {
        // If not valid JSON, log as text
        console.log('Submit response text:', text);
        if (!response.ok) {
          throw new Error('Failed to submit quiz');
        }
        // Return empty object if we can't parse the response but it was successful
        return {};
      }
    });
  })
  .then(data => {
    console.log('Submit success:', data);
    if (quizTimer) {
      clearInterval(quizTimer);
    }
    
    // Show success message
    EduQuiz.showError('Quiz submitted successfully!');
    
    // Add a small delay before redirect to ensure response is processed
    setTimeout(() => {
      window.location.href = `/quiz-results?classId=${classroomId}&quizId=${quizId}`;
    }, 1500);
  })
  .catch(error => {
    console.error('Submit catch error:', error);
    EduQuiz.showError(error.message || 'An error occurred while submitting the quiz.');
    EduQuiz.showLoading(false);
    
    // Reset submission flag
    window.isSubmitting = false;
    
    // Re-enable submit button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Submit Quiz';
    }
  });
}

/**
 * Navigation functions for quiz questions
 */
EduQuiz.goToNextQuestion = function() {
  if (currentQuestion < quizData.questions.length - 1) {
    currentQuestion++;
    if (typeof window.displayQuestion === 'function') {
      window.displayQuestion(currentQuestion);
    }
  }
}

EduQuiz.goToPreviousQuestion = function() {
  if (currentQuestion > 0) {
    currentQuestion--;
    if (typeof window.displayQuestion === 'function') {
      window.displayQuestion(currentQuestion);
    }
  }
}

EduQuiz.goToQuestion = function(index) {
  if (index >= 0 && index < quizData.questions.length) {
    currentQuestion = index;
    if (typeof window.displayQuestion === 'function') {
      window.displayQuestion(currentQuestion);
    }
  }
}

/**
 * Start quiz timer
 * @param {Date} endTime - The time when the quiz should end
 */
EduQuiz.startQuizTimer = function(endTime) {
  quizStartTime = new Date().toISOString();
  const timerElement = document.getElementById('timer');
  const timerDisplays = document.querySelectorAll('.timer-display');
  
  if (!timerElement && timerDisplays.length === 0) {
    console.error('No timer elements found');
    return;
  }
  
  // Parse the endTime if it's a string
  const parsedEndTime = typeof endTime === 'string' ? new Date(endTime) : endTime;
  
  // Make sure we have a valid date object
  if (!(parsedEndTime instanceof Date) || isNaN(parsedEndTime)) {
    console.error('Invalid end time provided to timer:', endTime);
    if (timerElement) timerElement.innerHTML = '--:--';
    timerDisplays.forEach(display => display.innerHTML = '--:--');
    return;
  }
  
  console.log('Starting timer with end time:', parsedEndTime);
  EduQuiz.updateTimerDisplay(parsedEndTime);
  
  quizTimer = setInterval(() => {
    EduQuiz.updateTimerDisplay(parsedEndTime);
  }, 1000);
}

/**
 * Update timer display
 * @param {Date} endTime - The time when the quiz should end
 */
EduQuiz.updateTimerDisplay = function(endTime) {
  const timerElement = document.getElementById('timer');
  const timerDisplays = document.querySelectorAll('.timer-display');
  
  if (!timerElement && timerDisplays.length === 0) {
    console.error('No timer elements found');
    return 0;
  }
  
  const now = new Date();
  
  // Parse the endTime if it's a string
  const endDateTime = typeof endTime === 'string' ? new Date(endTime) : endTime;
  
  // Validate that endDateTime is a valid date
  if (!(endDateTime instanceof Date) || isNaN(endDateTime)) {
    console.error('Invalid end time in updateTimerDisplay:', endTime);
    if (timerElement) timerElement.innerHTML = '--:--';
    timerDisplays.forEach(display => display.innerHTML = '--:--');
    return 0; // Return 0 to indicate time is up
  }
  
  const timeLeft = endDateTime - now;
  
  if (timeLeft <= 0) {
    clearInterval(quizTimer);
    const timeUpText = "Time's up!";
    if (timerElement) timerElement.innerHTML = timeUpText;
    timerDisplays.forEach(display => display.innerHTML = timeUpText);
    EduQuiz.submitQuizAnswers();
    return 0;
  }
  
  const minutes = Math.floor(timeLeft / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  // Format the time display
  const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  if (timerElement) timerElement.innerHTML = timeText;
  timerDisplays.forEach(display => display.innerHTML = timeText);
  
  // Add warning classes based on time left
  const timerContainer = document.querySelector('.quiz-timer');
  if (timerContainer) {
    timerContainer.classList.remove('warning', 'danger');
    
    if (timeLeft < 60000) { // less than 1 minute
      timerContainer.classList.add('danger');
    } else if (timeLeft < 300000) { // less than 5 minutes
      timerContainer.classList.add('warning');
    }
  }
  
  return timeLeft;
}

/**
 * Utility functions
 */
EduQuiz.showError = function(message) {
  console.error('Error:', message);
  
  const errorContainer = document.getElementById('error-container');
  if (errorContainer) {
    // Clear any existing timeout for the error container
    if (window.errorTimeout) {
      clearTimeout(window.errorTimeout);
    }
    
    // Set the error message and show it
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    
    // Ensure the loading spinner is hidden
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
    }
    
    // Scroll to the top to make the error visible
    window.scrollTo(0, 0);
    
    // Auto-hide after 8 seconds
    window.errorTimeout = setTimeout(() => {
      errorContainer.style.display = 'none';
    }, 8000);
  } else {
    console.error(message);
  }
}

EduQuiz.showLoading = function(isLoading) {
  const loadingContainer = document.getElementById('loading-container');
  const quizContainer = document.getElementById('quiz-container');
  const resultsContainer = document.getElementById('results-container');
  const detailsContainer = document.getElementById('details-container');
  
  // Handle loading container
  if (loadingContainer) {
    loadingContainer.style.display = isLoading ? 'flex' : 'none';
  }
  
  // Handle content containers
  if (quizContainer) {
    quizContainer.style.display = isLoading ? 'none' : 'block';
  }
  
  if (resultsContainer) {
    resultsContainer.style.display = isLoading ? 'none' : 'block';
  }
  
  if (detailsContainer) {
    detailsContainer.style.display = isLoading ? 'none' : 'block';
  }
  
  console.log(`Loading state changed to: ${isLoading ? 'loading' : 'loaded'}`, {
    loadingContainer: loadingContainer ? loadingContainer.style.display : 'not found',
    quizContainer: quizContainer ? quizContainer.style.display : 'not found',
    resultsContainer: resultsContainer ? resultsContainer.style.display : 'not found',
    detailsContainer: detailsContainer ? detailsContainer.style.display : 'not found'
  });
}

// Format utility functions
EduQuiz.formatDate = function(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}

EduQuiz.formatDuration = function(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    let result = `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (remainingMinutes > 0) {
      result += ` ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
    return result;
  }
}

// Expose the EduQuiz object to the global scope
window.EduQuiz = EduQuiz; 