// Teacher Grade PDF with AI Support
document.addEventListener('DOMContentLoaded', function() {
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const classroomId = params.get('classId');
    const quizId = params.get('quizId');
    const studentId = params.get('studentId');
    
    // Validate required parameters
    if (!classroomId || !quizId || !studentId) {
        showError('Missing required parameters. Please go back and try again.');
        return;
    }
    
    // Initialize variables
    let studentPdfUrl = null;
    let modelAnswerPdfUrl = null;
    let quizData = null;
    let studentSubmission = null;
    let currentTab = 'student';
    let currentGradingMode = 'simple';
    
    // Setup event listeners
    document.getElementById('back-link').addEventListener('click', function(e) {
        e.preventDefault();
        // Go back to quiz results
        window.location.href = `/teacher_classroom?classId=${classroomId}&tab=quizzes&quizId=${quizId}&view=results`;
    });
    
    // PDF tab switching
    document.querySelectorAll('.pdf-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Skip if already active
            if (this.classList.contains('active')) return;
            
            // Update active tab
            document.querySelectorAll('.pdf-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Get tab type
            currentTab = this.dataset.tab;
            
            // Switch PDF source
            if (currentTab === 'student') {
                document.getElementById('pdf-frame').src = studentPdfUrl;
                document.getElementById('pdf-filename').textContent = studentSubmission?.answerFile?.filename || 'student_submission.pdf';
                document.getElementById('download-pdf').href = studentPdfUrl;
            } else {
                // Load model answer if available
                if (modelAnswerPdfUrl) {
                    document.getElementById('pdf-frame').src = modelAnswerPdfUrl;
                    document.getElementById('pdf-filename').textContent = quizData?.modelAnswerFile?.filename || 'model_answer.pdf';
                    document.getElementById('download-pdf').href = modelAnswerPdfUrl;
                } else {
                    // If no model answer, just show a message
                    showPdfLoadingError('No model answer available for this quiz.');
                }
            }
        });
    });
    
    // Grading mode toggle
    document.querySelectorAll('.grading-mode-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Skip if already active
            if (this.classList.contains('active')) return;
            
            // Update active button
            document.querySelectorAll('.grading-mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Get grading mode
            currentGradingMode = this.dataset.mode;
            
            // Toggle button visibility based on mode
            if (currentGradingMode === 'simple') {
                document.getElementById('ai-grade-btn').style.display = 'inline-block';
                document.getElementById('advanced-grade-btn').style.display = 'none';
            } else {
                document.getElementById('ai-grade-btn').style.display = 'none';
                document.getElementById('advanced-grade-btn').style.display = 'inline-block';
            }
        });
    });
    
    // AI Grade button
    document.getElementById('ai-grade-btn').addEventListener('click', function() {
        startAIGrading();
    });
    
    // Advanced AI Grade button
    document.getElementById('advanced-grade-btn').addEventListener('click', function() {
        startAdvancedGrading();
    });
    
    // Save Model Answers button
    document.getElementById('save-model-answers-btn').addEventListener('click', function() {
        showModelAnswersForm();
    });
    
    // Submit Model Answers button
    document.getElementById('submit-model-answers-btn').addEventListener('click', function() {
        submitModelAnswers();
    });
    
    // Cancel Model Answers button
    document.getElementById('cancel-model-answers-btn').addEventListener('click', function() {
        document.getElementById('model-answers-container').style.display = 'none';
    });
    
    // Apply AI Grade button
    document.getElementById('apply-ai-grade-btn').addEventListener('click', function() {
        applyAIGrade();
    });
    
    // Apply Advanced Grade button
    document.getElementById('apply-advanced-grade-btn').addEventListener('click', function() {
        applyAdvancedGrade();
    });
    
    // Cancel AI grading button
    document.getElementById('cancel-grading-btn').addEventListener('click', function() {
        // Hide AI grading section
        document.getElementById('ai-grading-container').style.display = 'none';
    });
    
    // Cancel Advanced grading button
    document.getElementById('cancel-advanced-grading-btn').addEventListener('click', function() {
        // Hide Advanced grading section
        document.getElementById('advanced-grading-container').style.display = 'none';
    });
    
    // Manual grading buttons
    document.getElementById('submit-manual-grade-btn').addEventListener('click', function() {
        submitManualGrade();
    });
    
    document.getElementById('cancel-manual-grading-btn').addEventListener('click', function() {
        // Reset form
        document.getElementById('manual-score').value = '';
        document.getElementById('manual-feedback').value = '';
    });
    
    // Load submission data
    loadSubmission();
    
    // Function to load submission data
    function loadSubmission() {
        showLoading(true);
        
        // Fetch quiz results to get submission details
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
        .then(data => {
            console.log('Loaded quiz data:', data);
            quizData = data;
            
            // Set quiz title
            document.getElementById('quiz-title').textContent = `Grade: ${data.quizTitle || 'PDF Quiz'}`;
            
            // Find student submission
            const submission = data.submissions.find(s => 
                s.studentId === studentId || 
                s.student_id === studentId || 
                (s.student_id && s.student_id.toString() === studentId)
            );
            
            if (!submission) {
                throw new Error('Student submission not found');
            }
            
            studentSubmission = submission;
            
            // Set student information
            document.getElementById('student-name').textContent = submission.studentName;
            
            // Format submission date
            const submissionDate = new Date(submission.submittedAt);
            document.getElementById('submission-date').textContent = `Submitted on ${submissionDate.toLocaleDateString()} at ${submissionDate.toLocaleTimeString()}`;
            
            // Set up PDF URLs (with JWT token)
            const token = localStorage.getItem('access_token');
            studentPdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/pdf?token=${token}`;
            document.getElementById('pdf-frame').src = studentPdfUrl;
            document.getElementById('download-pdf').href = studentPdfUrl;
            
            // Check if there's a model answer
            if (data.hasModelAnswer) {
                modelAnswerPdfUrl = `/api/classrooms/${classroomId}/quizzes/${quizId}/pdf/answer?token=${token}`;
                document.getElementById('model-answer-tab').style.display = 'block';
            } else {
                document.getElementById('model-answer-tab').style.display = 'none';
            }
            
            // If submission is already graded, pre-populate the form
            if (submission.isGraded) {
                document.getElementById('manual-score').value = submission.score || 0;
                document.getElementById('manual-feedback').value = submission.feedback || '';
            }
            
            // If submission has been AI graded, show the AI grading
            if (submission.aiGrading) {
                document.getElementById('ai-grading-content').textContent = submission.aiGrading;
                document.getElementById('ai-grading-container').style.display = 'block';
                document.getElementById('final-score').value = submission.score || 0;
                document.getElementById('teacher-feedback').value = submission.feedback || submission.aiGrading;
            }
            
            // If submission has been advanced graded, show the advanced grading
            if (submission.advanced_grading) {
                displayAdvancedGradingResults(submission.advanced_grading);
            }
            
            // Everything loaded, show the grading container
            showLoading(false);
            document.getElementById('grading-container').style.display = 'block';
            
            // Set up PDF loading event listener
            const pdfFrame = document.getElementById('pdf-frame');
            pdfFrame.onload = function() {
                document.getElementById('pdf-loading').style.display = 'none';
            };
        })
        .catch(error => {
            console.error('Error loading submission:', error);
            showError(`Failed to load submission: ${error.message}`);
            showLoading(false);
        });
    }
    
    // Function to show model answers form
    function showModelAnswersForm() {
        // Show the model answers container
        document.getElementById('model-answers-container').style.display = 'block';
        
        // Get quiz questions
        const questions = quizData.questions || [];
        if (questions.length === 0) {
            document.getElementById('model-answers-form').innerHTML = `
                <div class="error-message">
                    <p>No questions found for this quiz. Please add questions first.</p>
                </div>
            `;
            return;
        }
        
        // Get existing model answers
        const modelAnswers = quizData.model_answers || [];
        
        // Generate form HTML
        let formHtml = '';
        
        questions.forEach((question, index) => {
            // Find existing model answer for this question
            const existingAnswer = modelAnswers.find(a => a.question_id === question.id)?.answer || '';
            
            formHtml += `
                <div class="question-card">
                    <div class="question-header">
                        Question ${index + 1}: ${question.text}
                    </div>
                    <div class="question-content">
                        <div class="form-group">
                            <label for="model-answer-${question.id}">Model Answer:</label>
                            <textarea id="model-answer-${question.id}" 
                                      class="model-answer-input" 
                                      data-question-id="${question.id}"
                                      rows="4">${existingAnswer}</textarea>
                        </div>
                    </div>
                </div>
            `;
        });
        
        document.getElementById('model-answers-form').innerHTML = formHtml;
    }
    
    // Function to submit model answers
    function submitModelAnswers() {
        // Collect model answers from form
        const modelAnswers = [];
        document.querySelectorAll('.model-answer-input').forEach(input => {
            modelAnswers.push({
                question_id: input.dataset.questionId,
                answer: input.value.trim()
            });
        });
        
        // Show loading state
        const submitButton = document.getElementById('submit-model-answers-btn');
        const originalButtonText = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        submitButton.disabled = true;
        
        // Call API to save model answers
        fetch(`/api/teacher/model_answers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                classId: classroomId,
                quizId: quizId,
                modelAnswers: modelAnswers
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save model answers');
            }
            return response.json();
        })
        .then(data => {
            console.log('Model answers saved:', data);
            
            // Update quizData with new model answers
            quizData.model_answers = modelAnswers;
            
            // Hide model answers form
            document.getElementById('model-answers-container').style.display = 'none';
            
            // Reset button
            submitButton.innerHTML = originalButtonText;
            submitButton.disabled = false;
            
            // Show success notification
            showNotification('Model answers saved successfully!', 'success');
        })
        .catch(error => {
            console.error('Error saving model answers:', error);
            
            // Reset button
            submitButton.innerHTML = originalButtonText;
            submitButton.disabled = false;
            
            // Show error notification
            showNotification(`Failed to save model answers: ${error.message}`, 'error');
        });
    }
    
    // Function to initiate AI grading
    function startAIGrading() {
        // Show loading state
        document.getElementById('ai-grading-container').style.display = 'block';
        document.getElementById('ai-grading-content').innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p>AI is grading the submission. This may take a moment...</p>
                <p><small>Please be patient as this process can take 30-60 seconds.</small></p>
            </div>
        `;
        
        // Disable the AI Grade button to prevent multiple requests
        document.getElementById('ai-grade-btn').disabled = true;
        
        // Add timeout handling
        const timeoutDuration = 60000; // 1 minute
        const timeoutId = setTimeout(() => {
            document.getElementById('ai-grading-content').innerHTML = `
                <div class="loading-container">
                    <div class="spinner"></div>
                    <p>AI is still grading the submission...</p>
                    <p><small>This is taking longer than expected. You can continue waiting or try again later.</small></p>
                </div>
            `;
        }, timeoutDuration);
        
        // Call the AI grading API
        fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/ai-grade`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error('Failed to perform AI grading');
            }
            return response.json();
        })
        .then(data => {
            console.log('AI grading result:', data);
            
            // Display the AI grading
            document.getElementById('ai-grading-content').textContent = data.aiGrading;
            
            // Try to extract a suggested score from the AI grading
            try {
                const scoreMatch = data.aiGrading.match(/(?:Final|Total|Overall)\s+Score:\s*(\d+)(?:\/|\s+out\s+of\s+)(\d+)/i);
                if (scoreMatch) {
                    const score = parseInt(scoreMatch[1]);
                    const maxScore = parseInt(scoreMatch[2]);
                    document.getElementById('final-score').value = score;
                    document.getElementById('max-score').textContent = maxScore;
                }
            } catch (e) {
                console.warn('Could not extract score from AI grading:', e);
            }
            
            // Enable the AI Grade button again
            document.getElementById('ai-grade-btn').disabled = false;
            
            // Copy AI grading to feedback field for editing
            document.getElementById('teacher-feedback').value = data.aiGrading;
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.error('Error during AI grading:', error);
            document.getElementById('ai-grading-content').innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to complete AI grading: ${error.message}</p>
                    <p>Please try again or grade manually.</p>
                </div>
            `;
            
            // Enable the AI Grade button again
            document.getElementById('ai-grade-btn').disabled = false;
        });
    }
    
    // Function to start advanced grading
    function startAdvancedGrading() {
        // Check if model answers exist
        if (!quizData.model_answers || quizData.model_answers.length === 0) {
            showNotification('Please add model answers before using advanced grading.', 'warning');
            showModelAnswersForm();
            return;
        }
        
        // Show advanced grading container
        document.getElementById('advanced-grading-container').style.display = 'block';
        document.getElementById('advanced-grading-loading').style.display = 'flex';
        document.getElementById('total-score-container').style.display = 'none';
        document.getElementById('question-by-question-results').innerHTML = '';
        
        // Disable the Advanced Grade button to prevent multiple requests
        document.getElementById('advanced-grade-btn').disabled = true;
        
        // Update loading status with warning about processing time
        document.getElementById('advanced-loading-status').innerHTML = 
            'Extracting text from PDF pages...<br><small>This process may take 1-2 minutes depending on PDF size.</small>';
        
        // Add timeout handling
        const timeoutDuration = 120000; // 2 minutes
        const timeoutId = setTimeout(() => {
            document.getElementById('advanced-loading-status').innerHTML = 
                'The grading is taking longer than expected.<br>You can continue waiting or try again later.';
        }, timeoutDuration);
        
        // Call the advanced grading API
        fetch('/api/teacher/grade_pdf_advanced', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                classId: classroomId,
                quizId: quizId,
                studentId: studentId
            })
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error('Failed to perform advanced grading');
            }
            return response.json();
        })
        .then(data => {
            console.log('Advanced grading result:', data);
            
            // Display the advanced grading results
            displayAdvancedGradingResults(data.grading_results);
            
            // Enable the Advanced Grade button again
            document.getElementById('advanced-grade-btn').disabled = false;
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.error('Error during advanced grading:', error);
            document.getElementById('advanced-grading-loading').style.display = 'none';
            document.getElementById('question-by-question-results').innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to complete advanced grading: ${error.message}</p>
                    <p>Please try again or use simple grading mode.</p>
                </div>
            `;
            
            // Enable the Advanced Grade button again
            document.getElementById('advanced-grade-btn').disabled = false;
        });
    }
    
    // Function to display advanced grading results
    function displayAdvancedGradingResults(results) {
        // Hide loading, show score
        document.getElementById('advanced-grading-loading').style.display = 'none';
        document.getElementById('total-score-container').style.display = 'block';
        
        // Set total score
        document.getElementById('total-points').textContent = results.total_score;
        document.getElementById('total-possible').textContent = results.max_total;
        document.getElementById('percent-score').textContent = `${results.percentage}%`;
        
        // Generate question by question results
        let resultsHtml = '';
        
        results.graded_answers.forEach((answer, index) => {
            resultsHtml += `
                <div class="question-card">
                    <div class="question-header">
                        <div class="score-badge">${answer.score}</div>
                        Question ${index + 1}: ${answer.question_text}
                    </div>
                    <div class="question-content">
                        <div class="answer-section">
                            <div class="student-answer">
                                <h4>Student Answer:</h4>
                                <p>${answer.student_answer}</p>
                            </div>
                            <div class="model-answer">
                                <h4>Model Answer:</h4>
                                <p>${getModelAnswerForQuestion(answer.question_id)}</p>
                            </div>
                        </div>
                        
                        <div class="feedback-section">
                            <h4>Feedback:</h4>
                            <p>${answer.feedback}</p>
                        </div>
                        
                        <div class="key-points">
                            <div class="points-addressed">
                                <h4>Key Points Addressed:</h4>
                                <ul>
                                    ${answer.key_points_addressed.map(point => `<li>${point}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="points-missed">
                                <h4>Key Points Missed:</h4>
                                <ul>
                                    ${answer.key_points_missed.map(point => `<li>${point}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        document.getElementById('question-by-question-results').innerHTML = resultsHtml;
    }
    
    // Helper function to get model answer for a question
    function getModelAnswerForQuestion(questionId) {
        const modelAnswer = quizData.model_answers?.find(a => a.question_id === questionId);
        return modelAnswer ? modelAnswer.answer : 'No model answer provided';
    }
    
    // Function to apply advanced grade
    function applyAdvancedGrade() {
        // Get total score from results
        const totalScore = parseFloat(document.getElementById('total-points').textContent);
        const maxScore = parseFloat(document.getElementById('total-possible').textContent);
        const percentage = parseFloat(document.getElementById('percent-score').textContent);
        
        if (isNaN(totalScore) || isNaN(maxScore)) {
            showNotification('Invalid score values', 'error');
            return;
        }
        
        // Generate feedback from detailed results
        let feedback = `Advanced AI Grading Results\n\n`;
        feedback += `Total Score: ${totalScore}/${maxScore} (${percentage}%)\n\n`;
        
        document.querySelectorAll('.question-card').forEach((card, index) => {
            const questionText = card.querySelector('.question-header').textContent.trim().replace(/^\d+\s*:\s*/, '');
            const score = card.querySelector('.score-badge').textContent;
            const feedbackText = card.querySelector('.feedback-section p').textContent;
            
            feedback += `Question ${index + 1}: ${questionText}\n`;
            feedback += `Score: ${score}\n`;
            feedback += `Feedback: ${feedbackText}\n\n`;
        });
        
        // Show loading state
        const applyButton = document.getElementById('apply-advanced-grade-btn');
        const originalButtonText = applyButton.innerHTML;
        applyButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
        applyButton.disabled = true;
        
        // Call the API to apply the grade
        fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/apply-ai-grade`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                score: totalScore,
                feedback: feedback
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to apply grade');
            }
            return response.json();
        })
        .then(data => {
            console.log('Grade applied successfully:', data);
            
            // Show success notification
            showNotification('Grade applied successfully!', 'success');
            
            // Reset apply button
            applyButton.innerHTML = originalButtonText;
            applyButton.disabled = false;
            
            // Redirect back to quiz results after delay
            setTimeout(() => {
                window.location.href = `/teacher_classroom?classId=${classroomId}&tab=quizzes&quizId=${quizId}&view=results`;
            }, 2000);
        })
        .catch(error => {
            console.error('Error applying grade:', error);
            
            // Reset apply button
            applyButton.innerHTML = originalButtonText;
            applyButton.disabled = false;
            
            // Show error notification
            showNotification(`Failed to apply grade: ${error.message}`, 'error');
        });
    }
    
    // Function to apply AI grade with optional adjustments
    function applyAIGrade() {
        // Get values from form
        const score = parseFloat(document.getElementById('final-score').value);
        const feedback = document.getElementById('teacher-feedback').value;
        
        // Validate
        if (isNaN(score) || score < 0 || score > 100) {
            alert('Please enter a valid score between 0 and 100');
            return;
        }
        
        // Prepare data
        const gradeData = {
            score: score,
            feedback: feedback
        };
        
        // Show loading state
        const applyButton = document.getElementById('apply-ai-grade-btn');
        const originalButtonText = applyButton.innerHTML;
        applyButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
        applyButton.disabled = true;
        
        // Call the API to apply the AI grade
        fetch(`/api/classrooms/${classroomId}/quizzes/${quizId}/submissions/${studentId}/apply-ai-grade`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gradeData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to apply AI grade');
            }
            return response.json();
        })
        .then(data => {
            console.log('Grade applied successfully:', data);
            
            // Show success notification
            showNotification('Grade applied successfully!', 'success');
            
            // Update the manual grading form
            document.getElementById('manual-score').value = score;
            document.getElementById('manual-feedback').value = feedback;
            
            // Reset apply button
            applyButton.innerHTML = originalButtonText;
            applyButton.disabled = false;
            
            // Redirect back to quiz results after delay
            setTimeout(() => {
                window.location.href = `/teacher_classroom?classId=${classroomId}&tab=quizzes&quizId=${quizId}&view=results`;
            }, 2000);
        })
        .catch(error => {
            console.error('Error applying AI grade:', error);
            
            // Reset apply button
            applyButton.innerHTML = originalButtonText;
            applyButton.disabled = false;
            
            // Show error notification
            showNotification(`Failed to apply grade: ${error.message}`, 'error');
        });
    }
    
    // Function to submit a manual grade
    function submitManualGrade() {
        // Get values from form
        const score = parseFloat(document.getElementById('manual-score').value);
        const feedback = document.getElementById('manual-feedback').value;
        
        // Validate
        if (isNaN(score) || score < 0 || score > 100) {
            alert('Please enter a valid score between 0 and 100');
            return;
        }
        
        // Prepare data
        const gradeData = {
            score: score,
            feedback: feedback
        };
        
        // Show loading state
        const submitButton = document.getElementById('submit-manual-grade-btn');
        const originalButtonText = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        submitButton.disabled = true;
        
        // Call the API to save the grade
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
                throw new Error('Failed to save grade');
            }
            return response.json();
        })
        .then(data => {
            console.log('Grade saved successfully:', data);
            
            // Show success notification
            showNotification('Grade saved successfully!', 'success');
            
            // Reset submit button
            submitButton.innerHTML = originalButtonText;
            submitButton.disabled = false;
            
            // Redirect back to quiz results after delay
            setTimeout(() => {
                window.location.href = `/teacher_classroom?classId=${classroomId}&tab=quizzes&quizId=${quizId}&view=results`;
            }, 2000);
        })
        .catch(error => {
            console.error('Error saving grade:', error);
            
            // Reset submit button
            submitButton.innerHTML = originalButtonText;
            submitButton.disabled = false;
            
            // Show error notification
            showNotification(`Failed to save grade: ${error.message}`, 'error');
        });
    }
    
    // Helper function to show or hide loading spinner
    function showLoading(show) {
        document.getElementById('loading-container').style.display = show ? 'flex' : 'none';
    }
    
    // Helper function to show PDF loading error
    function showPdfLoadingError(message) {
        document.getElementById('pdf-loading').style.display = 'flex';
        document.getElementById('pdf-loading').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }
    
    // Helper function to show error message
    function showError(message) {
        document.getElementById('error-container').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
        document.getElementById('error-container').style.display = 'block';
    }
    
    // Helper function to show notification
    function showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';
            document.body.appendChild(notification);
        }
        
        // Set notification content and type
        notification.innerHTML = `<span>${message}</span>`;
        notification.className = `notification ${type}`;
        
        // Show the notification
        notification.style.display = 'block';
        notification.style.opacity = '1';
        
        // Hide after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 500);
        }, 3000);
    }
});