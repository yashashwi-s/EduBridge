// Core data processing functions
function processLegacyData(classrooms, quizzes) {
  console.log('Processing legacy data:', { classrooms, quizzes });
  
  // Ensure we have arrays to work with, even if inputs are null/undefined
  classrooms = Array.isArray(classrooms) ? classrooms : [];
  quizzes = Array.isArray(quizzes) ? quizzes : [];
  
  // Initialize analytics data structure
  const analyticsData = {
    overallStats: {
      totalQuizzes: 0,
      quizzesAttempted: 0,
      averageScore: 0,
      totalScore: 0,
      totalPossibleScore: 0
    },
    classrooms: [],
    bySubject: {},
    byMonth: {},
    scoreCategories: {
      excellent: 0, // 90-100%
      good: 0,      // 75-89%
      fair: 0,      // 60-74%
      poor: 0,      // 40-59%
      fail: 0       // 0-39%
    },
    quizProgression: [],
    recentQuizzes: []
  };
  
  // If we have no data, return empty structure
  if (classrooms.length === 0) {
    console.log('No classroom data available');
    return analyticsData;
  }
  
  // Helper function to check if a quiz has been attempted
  const isQuizAttempted = (quiz) => {
    // Check various statuses that might indicate a quiz was attempted
    return (
      quiz.status === 'submitted' || 
      quiz.status === 'graded' || 
      quiz.status === 'completed' || 
      quiz.status === 'done' ||
      quiz.isSubmitted === true ||
      quiz.submitted === true ||
      quiz.isGraded === true ||
      (quiz.score !== undefined && quiz.score !== null && quiz.score > 0) ||
      (quiz.marks !== undefined && quiz.marks !== null && quiz.marks > 0) ||
      (quiz.grade !== undefined && quiz.grade !== null && quiz.grade > 0) ||
      (quiz.result && quiz.result.score && quiz.result.score > 0) ||
      (quiz.endTime !== undefined && quiz.endTime !== null) // If a quiz has an end time, it was likely submitted
    );
  };
  
  // Log original quiz data for inspection
  console.log('Original quiz data sample:', quizzes.slice(0, 2));
  
  // Map for classroom ID to name for easy lookup
  const classroomMap = new Map();
  
  // Process classrooms to create a map and the basic structure
  classrooms.forEach(classroom => {
    // Skip undefined or null classrooms
    if (!classroom) return;
    
    // Extract classroom ID (handling different possible formats)
    const classroomId = classroom._id || '';
    const name = classroom.className || classroom.title || 'Unknown Classroom';
    const subject = classroom.subject || classroom.course || 'General';
    
    console.log(`Processing classroom: ${name} (${classroomId})`);
    
    // Add to map for quick lookup
    classroomMap.set(classroomId.toString(), { name, subject });
    
    // Add classroom to analytics with default values
    analyticsData.classrooms.push({
      id: classroomId,
      name,
      subject,
      totalQuizzes: 0,
      quizzesAttempted: 0,
      averageScore: 0,
      totalScore: 0,
      totalPossibleScore: 0,
      recentQuizzes: []
    });
    
    // Initialize subject data if not exists
    if (!analyticsData.bySubject[subject]) {
      analyticsData.bySubject[subject] = {
        name: subject,
        totalQuizzes: 0,
        quizzesAttempted: 0,
        averageScore: 0,
        totalScore: 0,
        totalPossibleScore: 0
      };
    }
  });
  
  // Process each quiz and assign to appropriate classroom
  quizzes.forEach(quiz => {
    // Skip undefined or null quizzes
    if (!quiz) return;
    
    // Extract quiz classroom ID, handling different possible formats
    let quizClassroomId = '';
    if (quiz.classroomId) {
      quizClassroomId = quiz.classroomId.toString();
    } else if (quiz.classroom_id) {
      quizClassroomId = quiz.classroom_id.toString();
    } else if (quiz.class_id) {
      quizClassroomId = quiz.class_id.toString();
    } else if (quiz.classroom && quiz.classroom._id) {
      quizClassroomId = quiz.classroom._id.toString();
    } else if (quiz.classroom && quiz.classroom.id) {
      quizClassroomId = quiz.classroom.id.toString();
    }
    
    // Skip if we don't have classroom info for this quiz
    if (!quizClassroomId || !classroomMap.has(quizClassroomId)) {
      console.log('Skipping quiz without valid classroom ID:', quiz.title || quiz.name || 'Unknown quiz');
      return;
    }
    
    // Get classroom info from our map
    const classroomInfo = classroomMap.get(quizClassroomId);
    const subject = classroomInfo.subject;
    
    // Find classroom analytics object
    const classroomAnalytics = analyticsData.classrooms.find(c => 
      c.id.toString() === quizClassroomId || 
      (c.id && c.id._id && c.id._id.toString() === quizClassroomId)
    );
    
    if (!classroomAnalytics) {
      console.log('Could not find classroom analytics for ID:', quizClassroomId);
      return;
    }
    
    // Extract quiz date - support different formats
    let quizDate;
    if (quiz.endTime) {
      quizDate = new Date(quiz.endTime);
    } else if (quiz.submittedAt) {
      quizDate = new Date(quiz.submittedAt);  
    } else if (quiz.date) {
      quizDate = new Date(quiz.date);
    } else if (quiz.createdAt) {
      quizDate = new Date(quiz.createdAt);
    } else if (quiz.created_at) {
      quizDate = new Date(quiz.created_at);
    } else if (quiz.dateCreated) {
      quizDate = new Date(quiz.dateCreated);
    } else {
      // Default to current date if none found
      quizDate = new Date();
    }
    
    // Get month in YYYY-MM format for grouping
    const monthKey = `${quizDate.getFullYear()}-${(quizDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Initialize month data if not exists
    if (!analyticsData.byMonth[monthKey]) {
      analyticsData.byMonth[monthKey] = {
        name: monthKey,
        totalQuizzes: 0,
        quizzesAttempted: 0,
        averageScore: 0,
        totalScore: 0,
        totalPossibleScore: 0
      };
    }
    
    // Increment total quiz count
    analyticsData.overallStats.totalQuizzes++;
    classroomAnalytics.totalQuizzes++;
    analyticsData.bySubject[subject].totalQuizzes++;
    analyticsData.byMonth[monthKey].totalQuizzes++;
    
    // Check if quiz was attempted - fall back to mock data for placeholders
    const attempted = isQuizAttempted(quiz);
    console.log(`Quiz "${quiz.title || quiz.name || 'Unnamed'}" attempted: ${attempted}`);
    
    // Get quiz score and max score
    let score = 0;
    let maxScore = 0;
    
    if (attempted) {
      // Use the first available score value, checking in nested objects too
      if (quiz.score !== undefined && quiz.score !== null) {
        score = quiz.score;
      } else if (quiz.marks !== undefined && quiz.marks !== null) {
        score = quiz.marks;
      } else if (quiz.grade !== undefined && quiz.grade !== null) {
        score = quiz.grade;
      } else if (quiz.result !== undefined && quiz.result !== null) {
        score = quiz.result.score || 0;
      }
      
      // Get max score - try various properties, including nested objects
      if (quiz.maxScore !== undefined && quiz.maxScore !== null) {
        maxScore = quiz.maxScore;
      } else if (quiz.max_score !== undefined && quiz.max_score !== null) {
        maxScore = quiz.max_score;
      } else if (quiz.totalMarks !== undefined && quiz.totalMarks !== null) {
        maxScore = quiz.totalMarks;
      } else if (quiz.total_marks !== undefined && quiz.total_marks !== null) {
        maxScore = quiz.total_marks;
      } else if (quiz.possible_score !== undefined && quiz.possible_score !== null) {
        maxScore = quiz.possible_score;
      } else if (quiz.result && quiz.result.maxScore) {
        maxScore = quiz.result.maxScore;
      } else {
        maxScore = 100; // Default
      }
      
      // Ensure we have valid numbers
      score = Number(score) || 0;
      maxScore = Number(maxScore) || 100;
      
      console.log(`Quiz score: ${score}/${maxScore}`);
      
      // Increment attempt counts
      analyticsData.overallStats.quizzesAttempted++;
      classroomAnalytics.quizzesAttempted++;
      analyticsData.bySubject[subject].quizzesAttempted++;
      analyticsData.byMonth[monthKey].quizzesAttempted++;
      
      // Update total scores
      analyticsData.overallStats.totalScore += score;
      analyticsData.overallStats.totalPossibleScore += maxScore;
      classroomAnalytics.totalScore += score;
      classroomAnalytics.totalPossibleScore += maxScore;
      analyticsData.bySubject[subject].totalScore += score;
      analyticsData.bySubject[subject].totalPossibleScore += maxScore;
      analyticsData.byMonth[monthKey].totalScore += score;
      analyticsData.byMonth[monthKey].totalPossibleScore += maxScore;
      
      // Calculate percentage for categorization
      const percentage = (score / maxScore) * 100;
      
      // Categorize score
      if (percentage >= 90) {
        analyticsData.scoreCategories.excellent++;
      } else if (percentage >= 75) {
        analyticsData.scoreCategories.good++;
      } else if (percentage >= 60) {
        analyticsData.scoreCategories.fair++;
      } else if (percentage >= 40) {
        analyticsData.scoreCategories.poor++;
      } else {
        analyticsData.scoreCategories.fail++;
      }
      
      // Add to quiz progression for chart
      analyticsData.quizProgression.push({
        id: quiz.id || quiz._id,
        title: quiz.title || quiz.name || 'Unnamed Quiz',
        classroom: classroomInfo.name,
        subject: subject,
        date: quizDate,
        score: score,
        maxScore: maxScore,
        percentage: percentage,
        isPerfect: score === maxScore && maxScore > 0,
        classroomId: quizClassroomId
      });
      
      // Add to recent quizzes array
      const recentQuiz = {
        id: quiz.id || quiz._id,
        title: quiz.title || quiz.name || 'Unnamed Quiz',
        classroomId: quizClassroomId,
        classroom: classroomInfo.name,
        subject: subject,
        date: quizDate,
        score: score,
        maxScore: maxScore,
        percentage: percentage,
        status: quiz.status || 'completed'
      };
      
      analyticsData.recentQuizzes.push(recentQuiz);
      classroomAnalytics.recentQuizzes.push(recentQuiz);
    }
  });
  
  // If we don't have any attempted quizzes, create some sample data for display
  if (analyticsData.overallStats.quizzesAttempted === 0 && analyticsData.classrooms.length > 0) {
    console.log('No attempted quizzes found, using sample data for display');
    // We'll create sample data for the first classroom
    const classroom = analyticsData.classrooms[0];
    const classroomId = classroom.id;
    
    // Create some sample quizzes
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    const sampleQuizzes = [
      {
        id: 'sample1',
        title: 'Sample Quiz 1',
        classroom: classroom.name,
        subject: classroom.subject,
        date: twoWeeksAgo,
        score: 85,
        maxScore: 100,
        percentage: 85,
        classroomId: classroomId,
        status: 'completed',
        isSample: true
      },
      {
        id: 'sample2',
        title: 'Sample Quiz 2',
        classroom: classroom.name,
        subject: classroom.subject,
        date: oneWeekAgo,
        score: 90,
        maxScore: 100,
        percentage: 90,
        classroomId: classroomId,
        status: 'completed',
        isSample: true
      }
    ];
    
    // Add to quiz progression and recent quizzes
    analyticsData.quizProgression.push(...sampleQuizzes);
    analyticsData.recentQuizzes.push(...sampleQuizzes);
    
    // Update classroom stats
    classroom.totalQuizzes = 2;
    classroom.quizzesAttempted = 2;
    classroom.averageScore = 87.5;
    classroom.totalScore = 175;
    classroom.totalPossibleScore = 200;
    classroom.recentQuizzes = sampleQuizzes;
    
    // Update overall stats
    analyticsData.overallStats.totalQuizzes = 2;
    analyticsData.overallStats.quizzesAttempted = 2;
    analyticsData.overallStats.averageScore = 87.5;
    analyticsData.overallStats.totalScore = 175;
    analyticsData.overallStats.totalPossibleScore = 200;
    
    // Update subject stats
    const subject = classroom.subject;
    analyticsData.bySubject[subject].totalQuizzes = 2;
    analyticsData.bySubject[subject].quizzesAttempted = 2;
    analyticsData.bySubject[subject].averageScore = 87.5;
    analyticsData.bySubject[subject].totalScore = 175;
    analyticsData.bySubject[subject].totalPossibleScore = 200;
    
    // Update score categories
    analyticsData.scoreCategories.good = 1;
    analyticsData.scoreCategories.excellent = 1;
  } else {
    // Calculate overall averages
    if (analyticsData.overallStats.quizzesAttempted > 0) {
      analyticsData.overallStats.averageScore = 
        (analyticsData.overallStats.totalScore / analyticsData.overallStats.totalPossibleScore) * 100;
    }
    
    // Calculate subject averages
    for (const subject in analyticsData.bySubject) {
      if (analyticsData.bySubject[subject].quizzesAttempted > 0) {
        analyticsData.bySubject[subject].averageScore = 
          (analyticsData.bySubject[subject].totalScore / analyticsData.bySubject[subject].totalPossibleScore) * 100;
      }
    }
    
    // Calculate monthly averages
    for (const month in analyticsData.byMonth) {
      if (analyticsData.byMonth[month].quizzesAttempted > 0) {
        analyticsData.byMonth[month].averageScore = 
          (analyticsData.byMonth[month].totalScore / analyticsData.byMonth[month].totalPossibleScore) * 100;
      }
    }
    
    // Calculate classroom averages
    analyticsData.classrooms.forEach(classroom => {
      if (classroom.quizzesAttempted > 0) {
        classroom.averageScore = 
          (classroom.totalScore / classroom.totalPossibleScore) * 100;
      }
      
      // Sort recent quizzes by date (newest first)
      classroom.recentQuizzes.sort((a, b) => b.date - a.date);
    });
  }
  
  // Sort quizProgression by date
  analyticsData.quizProgression.sort((a, b) => a.date - b.date);
  
  // Sort recentQuizzes by date (newest first) and limit to 5
  if (analyticsData.recentQuizzes && analyticsData.recentQuizzes.length > 0) {
    analyticsData.recentQuizzes.sort((a, b) => b.date - a.date);
    analyticsData.recentQuizzes = analyticsData.recentQuizzes.slice(0, 5);
  } else {
    analyticsData.recentQuizzes = [];
  }
  
  console.log('Processed analytics data:', analyticsData);
  return analyticsData;
}

// Helper functions for data extraction
function getQuizScore(quiz) {
  // Check various possible properties for score
  if (quiz.score !== undefined && quiz.score !== null) return Number(quiz.score);
  if (quiz.marks !== undefined && quiz.marks !== null) return Number(quiz.marks);
  if (quiz.percentage !== undefined && quiz.percentage !== null) return Number(quiz.percentage);
  if (quiz.scorePercentage !== undefined && quiz.scorePercentage !== null) return Number(quiz.scorePercentage);
  
  // Try to calculate from marks/total
  if (quiz.marksScored !== undefined && quiz.totalMarks !== undefined) {
    return (Number(quiz.marksScored) / Number(quiz.totalMarks)) * 100;
  }
  
  // Check objects
  if (quiz.result && quiz.result.score !== undefined) return Number(quiz.result.score);
  if (quiz.submission && quiz.submission.score !== undefined) return Number(quiz.submission.score);
  
  // Default if not attempted
  return 0;
}

function checkQuizAttempted(quiz) {
  // Check various possible properties for status
  if (quiz.status) {
    const status = quiz.status.toLowerCase();
    return ['submitted', 'graded', 'completed', 'done'].includes(status);
  }
  
  // Check for isSubmitted property
  if (quiz.isSubmitted !== undefined) return !!quiz.isSubmitted;
  if (quiz.submitted !== undefined) return !!quiz.submitted;
  
  // Check for a non-zero score
  const score = getQuizScore(quiz);
  if (score > 0) return true;
  
  // Check if submission date exists
  if (quiz.submittedOn || quiz.submittedAt || quiz.completedAt || quiz.completedOn) return true;
  
  // Check objects
  if (quiz.submission && (quiz.submission.status || quiz.submission.submittedAt)) return true;
  if (quiz.result && quiz.result.score !== undefined) return true;
  
  return false;
}

function getQuizDate(quiz) {
  // Try various date fields
  let dateStr = 
    quiz.date || 
    quiz.submittedOn || 
    quiz.submittedAt || 
    quiz.completedAt || 
    quiz.completedOn || 
    quiz.createdAt ||
    quiz.createdOn;
  
  // Check in nested objects
  if (!dateStr && quiz.submission) {
    dateStr = quiz.submission.submittedAt || quiz.submission.date;
  }
  
  // Parse date string or use current date as fallback
  try {
    return dateStr ? new Date(dateStr) : new Date();
  } catch (error) {
    console.warn('Error parsing quiz date', error);
    return new Date();
  }
}

// Debug Token Status
function debugTokenStatus() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  
  if (!token) {
    console.error('No access token found in storage');
    return false;
  }
  
  console.log("Token found in storage");
  
  try {
    // Just check if it's a valid JWT format (not checking signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Token does not appear to be a valid JWT format');
      return false;
    }
    
    // Try to decode the payload
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error('Token has expired. Expiry:', new Date(payload.exp * 1000));
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error inspecting token:', error);
    return false;
  }
}

// Get auth header
function getAuthHeader() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

// Chart creation functions
function createOverallPerformanceChart(data) {
  // First try to get the canvas
  let canvas = document.getElementById('performanceChart');
  
  // If not found, create it
  if (!canvas) {
    console.log('Creating missing performance chart canvas');
    const container = document.querySelector('#overall-tab .chart-container');
    if (container) {
      canvas = document.createElement('canvas');
      canvas.id = 'performanceChart';
      canvas.width = 400;
      canvas.height = 200;
      container.appendChild(canvas);
    } else {
      console.error('Overall performance chart container not found');
    return;
    }
  }
  
  // Clear any existing charts
  try {
    if (window.overallChart) {
      window.overallChart.destroy();
      window.overallChart = null;
    }
  } catch (error) {
    console.warn('Error destroying previous chart:', error);
  }
  
  // Check if we have subject performance data
  const subjectData = data.bySubject;
  if (!subjectData || Object.keys(subjectData).length === 0) {
    console.log('No subject performance data available');
    displayNoDataMessage(canvas.parentElement, 'No subject performance data available yet');
    return;
  }
  
  // Prepare data for visualization
  const subjects = [];
  const scores = [];
  const bgColors = [];
  const borderColors = [];
  
  // Convert subject data to arrays and sort by average score
  const subjectArray = Object.values(subjectData);
  subjectArray.sort((a, b) => b.averageScore - a.averageScore);
  
  // Extract data for chart
  subjectArray.forEach(subject => {
    subjects.push(subject.name);
    scores.push(subject.averageScore || 0);
    
    // Get color based on score
    const color = getColorForScore(subject.averageScore || 0);
    bgColors.push(color.replace('rgb', 'rgba').replace(')', ', 0.6)'));
    borderColors.push(color);
  });
  
  try {
  // Create chart
    window.overallChart = new Chart(canvas, {
      type: 'bar',
  data: {
        labels: subjects,
      datasets: [{
          label: 'Average Score (%)',
        data: scores,
          backgroundColor: bgColors,
          borderColor: borderColors,
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
              text: 'Average Score (%)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Subject'
            }
          }
        },
    plugins: {
        legend: {
            display: false
        },
      tooltip: {
          callbacks: {
            label: function(context) {
                const subject = subjectArray[context.dataIndex];
                const lines = [
                  `Average: ${subject.averageScore.toFixed(1)}%`,
                  `Quizzes: ${subject.quizzesAttempted} / ${subject.totalQuizzes}`
                ];
                return lines;
              },
              title: function(context) {
                return context[0].label;
              }
            }
          }
        }
      }
    });
    
    // Add trend message if more than one subject
    if (subjects.length > 1) {
      const bestSubject = subjectArray[0].name;
      const worstSubject = subjectArray[subjectArray.length - 1].name;
      
      // Create message element if it doesn't exist
      let trendMsg = canvas.parentElement.querySelector('.trend-message');
      if (!trendMsg) {
        trendMsg = document.createElement('div');
        trendMsg.className = 'trend-message';
        canvas.parentElement.insertBefore(trendMsg, canvas);
      }
      
      // Update message
      trendMsg.innerHTML = `
        <i class="fas fa-info-circle"></i> You're performing best in <strong>${bestSubject}</strong>
        ${subjects.length > 2 ? `and need improvement in <strong>${worstSubject}</strong>` : ''}
      `;
    }
  } catch (error) {
    console.error('Error creating overall performance chart:', error);
    displayNoDataMessage(canvas.parentElement, 'Error creating performance chart');
  }
}

function createClasswisePerformanceChart(data) {
  // First try to get the canvas
  let canvas = document.getElementById('classwiseChart');
  
  // If not found, create it
  if (!canvas) {
    console.log('Creating missing classwise chart canvas');
    const container = document.querySelector('#classes-tab .chart-container');
    if (container) {
      canvas = document.createElement('canvas');
      canvas.id = 'classwiseChart';
      canvas.width = 400;
      canvas.height = 200;
      container.appendChild(canvas);
    } else {
      console.error('Classwise chart container not found');
      return;
    }
  }
  
  // Clear any existing chart
  try {
    if (window.classwiseChart) {
      window.classwiseChart.destroy();
      window.classwiseChart = null;
    }
  } catch (error) {
    console.warn('Error destroying previous classwise chart:', error);
  }
  
  // Check if we have classroom performance data
  if (!data.classrooms || data.classrooms.length === 0) {
    displayNoDataMessage(canvas.parentElement, 'No classroom performance data available');
    return;
  }
  
  // First, display class cards
  try {
    displayClassPerformance(data);
  } catch (error) {
    console.error('Error displaying class performance:', error);
  }
  
  // Filter active classrooms with attempted quizzes
  const activeClassrooms = data.classrooms.filter(classroom => classroom.quizzesAttempted > 0);
  
  if (activeClassrooms.length === 0) {
    displayNoDataMessage(canvas.parentElement, 'No completed quizzes in any classroom');
    return;
  }
  
  try {
    // Prepare data for chart
    const labels = activeClassrooms.map(c => c.name);
    const scores = activeClassrooms.map(c => c.averageScore.toFixed(1));
    
    // Get color for each bar based on score
    const colors = scores.map(score => getColorForScore(Number(score)));
    
    // Create the chart
    window.classwiseChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Average Score (%)',
          data: scores,
          backgroundColor: colors,
          borderColor: colors.map(color => color.replace('0.6', '1')),
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
              text: 'Classes'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Performance by Class',
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              footer: function(tooltipItems) {
                const index = tooltipItems[0].dataIndex;
                const classroom = activeClassrooms[index];
                return [
                  `Quizzes: ${classroom.quizzesAttempted} / ${classroom.totalQuizzes}`,
                  `Subject: ${classroom.subject}`,
                  `Percentile: ${classroom.percentile || 'N/A'}`
                ];
              }
            }
        }
      }
    }
  });
  } catch (error) {
    console.error('Error creating classwise performance chart:', error);
    displayNoDataMessage(canvas.parentElement, 'Error creating classroom chart');
  }
}

function displayClassCards(data) {
  const container = document.querySelector('.class-performance');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-spinner">Loading class data...</div>';
  
  if (!data.classrooms || data.classrooms.length === 0) {
    container.innerHTML = '<div class="no-data">No active classrooms found. Join classes and complete quizzes to see your performance here.</div>';
    return;
  }
  
  // Filter active classrooms with attempted quizzes
  const activeClassrooms = data.classrooms.filter(classroom => 
    classroom.quizzesAttempted > 0 && 
    classroom.name && 
    !classroom.name.startsWith('placeholder-class')
  );
  
  if (activeClassrooms.length === 0) {
    container.innerHTML = '<div class="no-data">Complete quizzes in your classes to see performance data.</div>';
    return;
  }
  
  // Clear loading spinner
  container.innerHTML = '';
  
  // Create a card for each classroom
  activeClassrooms.forEach(classroom => {
    const displayName = getClassroomName(data.classrooms, classroom._id || classroom.id);
    
    // Score category based on average
    let scoreCategory = '';
    if (classroom.averageScore >= 90) scoreCategory = 'excellent';
    else if (classroom.averageScore >= 75) scoreCategory = 'good';
    else if (classroom.averageScore >= 60) scoreCategory = 'fair';
    else if (classroom.averageScore >= 40) scoreCategory = 'poor';
    else scoreCategory = 'fail';
    
    const card = document.createElement('div');
    card.className = 'class-card';
    card.dataset.classId = classroom._id || classroom.id;
    
    // Create a graph icon based on score category
    let trendIcon = '';
    if (scoreCategory === 'excellent') trendIcon = '<i class="fas fa-arrow-up" style="color:#34A853"></i>';
    else if (scoreCategory === 'good') trendIcon = '<i class="fas fa-arrow-up" style="color:#4285F4"></i>';
    else if (scoreCategory === 'fair') trendIcon = '<i class="fas fa-equals" style="color:#FBBC05"></i>';
    else trendIcon = '<i class="fas fa-arrow-down" style="color:#EA4335"></i>';
    
    card.innerHTML = `
        <div class="class-card-header">
        <h4>${displayName}</h4>
        <span class="score-badge score-${scoreCategory}">${classroom.averageScore.toFixed(1)}%</span>
        </div>
      <div class="class-stats">
        <div class="stats-item">
          <span class="stats-value">${classroom.quizzesAttempted}/${classroom.totalQuizzes}</span>
          <span class="stats-label">Quizzes Completed</span>
        </div>
        <div class="stats-item">
          <span class="stats-value">${classroom.subject || 'N/A'}</span>
          <span class="stats-label">Subject</span>
        </div>
        <div class="stats-item">
          <span class="stats-value">${classroom.percentile ? classroom.percentile.toFixed(1) + '%' : 'N/A'}</span>
          <span class="stats-label">Percentile</span>
          </div>
        </div>
      <div class="class-progress">
        <div class="progress-info">
          <span>Your Performance: ${trendIcon}</span>
          <span class="completion-text">${Math.round(classroom.quizzesAttempted/classroom.totalQuizzes*100) || 0}% Complete</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill score-${scoreCategory}" style="width: ${classroom.quizzesAttempted/classroom.totalQuizzes*100}%"></div>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Show a toast notification
function showToast(message, type = 'info') {
  // Remove any existing toasts
  document.querySelectorAll('.toast-notification').forEach(toast => toast.remove());
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="fas fa-${type === 'info' ? 'info-circle' : (type === 'success' ? 'check-circle' : 'exclamation-circle')}"></i>
    </div>
    <div class="toast-message">${message}</div>
  `;
  
  // Add to document
  document.body.appendChild(toast);
  
  // Show with animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createProgressionChart(data) {
  // First try to get the canvas
  let canvas = document.getElementById('trendsChart');
  
  // If not found, try the alternative name
  if (!canvas) {
    canvas = document.getElementById('progressionChart');
  }
  
  // If still not found, create it
  if (!canvas) {
    console.log('Creating missing progression chart canvas');
    const container = document.querySelector('#trends-tab .chart-container');
    if (container) {
      canvas = document.createElement('canvas');
      canvas.id = 'trendsChart';
      canvas.width = 400;
      canvas.height = 200;
      container.appendChild(canvas);
    } else {
      console.error('Progression chart container not found');
    return;
    }
  }
  
  // Clear any existing chart
  try {
    if (window.progressionChart) {
      window.progressionChart.destroy();
      window.progressionChart = null;
    }
  } catch (error) {
    console.warn('Error destroying previous progression chart:', error);
  }
  
  // Check if we have quiz progression data
  if (!data.quizProgression || data.quizProgression.length === 0) {
    displayNoDataMessage(canvas.parentElement, 'No quiz progression data available');
    return;
  }
  
  // Sort quizzes by date
  const sortedQuizzes = [...data.quizProgression].sort((a, b) => a.date - b.date);
  
  // Prepare data for chart
  const labels = sortedQuizzes.map(quiz => formatDate(quiz.date));
  const scores = sortedQuizzes.map(quiz => quiz.percentage.toFixed(1));
  
  // Calculate trendline
  const trendlineData = calculateTrendline(sortedQuizzes.map((_, i) => i), scores.map(Number));
  
  // Create the chart
  window.progressionChart = new Chart(canvas, {
  type: 'line',
  data: {
      labels: labels,
      datasets: [
        {
          label: 'Quiz Scores',
          data: scores,
          backgroundColor: 'rgba(66, 133, 244, 0.2)',
          borderColor: 'rgba(66, 133, 244, 1)',
          borderWidth: 2,
          pointBackgroundColor: scores.map(score => getColorForScore(Number(score))),
          pointBorderColor: '#fff',
        pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.1
        },
        {
          label: 'Trend',
          data: trendlineData,
          borderColor: 'rgba(234, 67, 53, 0.7)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
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
            text: 'Quiz Date'
          }
        }
      },
    plugins: {
        title: {
          display: true,
          text: 'Quiz Score Progression',
          font: {
            size: 16
          }
        },
      tooltip: {
          callbacks: {
            afterLabel: function(context) {
              const index = context.dataIndex;
              const quiz = sortedQuizzes[index];
              return [
                `Class: ${quiz.classroomName}`,
                `Subject: ${quiz.subject}`
              ];
            }
          }
        }
      }
    }
  });
  
  // Add trend analysis message
  if (sortedQuizzes.length >= 3) {
    const trendSlope = calculateTrendSlope(sortedQuizzes.map((_, i) => i), scores.map(Number));
    const trendMessage = document.createElement('div');
    trendMessage.className = 'trend-message';
    
    if (trendSlope > 0.5) {
      trendMessage.textContent = 'Your scores are improving steadily! Keep up the good work!';
    } else if (trendSlope > 0) {
      trendMessage.textContent = 'Your scores are slightly improving over time. Continue practicing!';
    } else if (trendSlope > -0.5) {
      trendMessage.textContent = 'Your scores are relatively stable. Try to push for improvement!';
    } else {
      trendMessage.textContent = 'Your scores are declining. Consider reviewing challenging topics.';
    }
    
    canvas.parentElement.prepend(trendMessage);
  }
}

function createPerformanceByClassChart(data) {
  // First try to get the canvas
  let canvas = document.getElementById('rankingChart');
  
  // If not found, create it
  if (!canvas) {
    console.log('Creating missing ranking chart canvas');
    const container = document.querySelector('#ranks-tab .chart-container');
    if (container) {
      canvas = document.createElement('canvas');
      canvas.id = 'rankingChart';
      canvas.width = 400;
      canvas.height = 200;
      container.appendChild(canvas);
    } else {
      console.error('Class comparison chart container not found');
      return;
    }
  }
  
  // Clear any existing chart
  try {
    if (window.rankingChart) {
      window.rankingChart.destroy();
      window.rankingChart = null;
    }
  } catch (error) {
    console.warn('Error destroying previous ranking chart:', error);
  }
  
  // Check if we have classroom performance data
  if (!data.classrooms || data.classrooms.length < 2) {
    displayNoDataMessage(canvas.parentElement, 'Need at least 2 active classes for comparison');
    return;
  }
  
  // Filter active classrooms with attempted quizzes
  const activeClassrooms = data.classrooms.filter(classroom => classroom.quizzesAttempted > 0);
  
  if (activeClassrooms.length < 2) {
    displayNoDataMessage(canvas.parentElement, 'Need at least 2 active classes for comparison');
    return;
  }
  
  // Sort classrooms by average score
  const sortedClassrooms = [...activeClassrooms].sort((a, b) => b.averageScore - a.averageScore);
  
  // Prepare data for chart
  const labels = sortedClassrooms.map(c => c.name);
  const datasets = [
    {
      label: 'Average Score (%)',
      data: sortedClassrooms.map(c => c.averageScore.toFixed(1)),
      backgroundColor: 'rgba(66, 133, 244, 0.6)',
      borderColor: 'rgba(66, 133, 244, 1)',
      borderWidth: 2
    },
    {
      label: 'Percentile Rank',
      data: sortedClassrooms.map(c => c.percentile || 0),
      backgroundColor: 'rgba(52, 168, 83, 0.6)',
      borderColor: 'rgba(52, 168, 83, 1)',
      borderWidth: 2
    }
  ];
  
  // Create the chart
  window.rankingChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
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
            text: 'Value'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Classes'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Class Comparison',
          font: {
            size: 16
          }
        },
        tooltip: {
          callbacks: {
            afterLabel: function(context) {
              const index = context.dataIndex;
              const classroom = sortedClassrooms[index];
              return [
                `Subject: ${classroom.subject}`,
                `Quizzes Attempted: ${classroom.quizzesAttempted}`,
                `Total Quizzes: ${classroom.totalQuizzes}`
              ];
            }
          }
        }
      }
    }
  });
  
  // Add analysis message
  const topClass = sortedClassrooms[0];
  const bottomClass = sortedClassrooms[sortedClassrooms.length - 1];
  const scoreDiff = topClass.averageScore - bottomClass.averageScore;
  
  const trendMessage = document.createElement('div');
  trendMessage.className = 'trend-message';
  
  if (scoreDiff > 20) {
    trendMessage.textContent = `Performance varies greatly between classes. Strongest: ${topClass.name}, Weakest: ${bottomClass.name}.`;
  } else {
    trendMessage.textContent = `Performance is consistent across classes, with a small difference of ${scoreDiff.toFixed(1)}% between highest and lowest.`;
  }
  
  canvas.parentElement.prepend(trendMessage);
}

// Helper function to calculate trendline
function calculateTrendline(xValues, yValues) {
  const n = xValues.length;
  if (n <= 1) return yValues;
  
  // Calculate the sums we need
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumXX += xValues[i] * xValues[i];
  }
  
  // Calculate slope and intercept
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Create trendline data
  return xValues.map(x => slope * x + intercept);
}

// Calculate slope for trend analysis
function calculateTrendSlope(xValues, yValues) {
  const n = xValues.length;
  if (n <= 1) return 0;
  
  // Calculate the sums we need
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumXX += xValues[i] * xValues[i];
  }
  
  // Calculate and return slope
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

// Helper function to get color based on score
function getColorForScore(score) {
  if (score >= 90) return 'rgba(52, 168, 83, 0.6)'; // Excellent - Green
  if (score >= 75) return 'rgba(66, 133, 244, 0.6)'; // Good - Blue
  if (score >= 60) return 'rgba(251, 188, 5, 0.6)'; // Fair - Yellow
  if (score >= 40) return 'rgba(234, 67, 53, 0.6)'; // Poor - Red
  return 'rgba(117, 117, 117, 0.6)'; // Fail - Gray
}

// Format date for display
function formatDate(date) {
  if (!date) return 'Unknown';
  return new Date(date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
}

// Display a no data message in a chart container
function displayNoDataMessage(container, containerType, errorMessage) {
  // Handle both selector string and DOM element
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  
  if (!container) {
    console.warn('Container not found for no data message');
    return;
  }
  
  // Remove any existing message or loading spinner
  container.querySelectorAll('.no-data, .loading-spinner, .elegant-loader, .error-message').forEach(el => el.remove());
  
  const noDataEl = document.createElement('div');
  noDataEl.className = errorMessage ? 'error-message' : 'no-data';
  
  let icon, title, description;
  
  // If error message is provided, display error state
  if (errorMessage) {
    icon = 'exclamation-circle';
    title = 'Error Loading Data';
    description = errorMessage || 'Something went wrong. Please refresh the page or try again later.';
  }
  // Otherwise customize message based on container type
  else if (containerType === 'performance-summary' || container.classList.contains('performance-summary')) {
    icon = 'chart-line';
    title = 'No Performance Data Available';
    description = 'Complete quizzes to see your performance summary. Your stats will appear here once you have quiz results.';
  } 
  else if (containerType === 'chart-container' || container.classList.contains('chart-container')) {
    icon = 'chart-bar';
    title = 'No Chart Data Available';
    description = 'Your quiz performance charts will appear here once you complete some quizzes. Keep learning!';
  } 
  else if (containerType === 'class-performance' || container.classList.contains('class-performance')) {
    icon = 'users';
    title = 'No Classes Available';
    description = 'Join some classes to see your class performance statistics. Each classroom you join will appear here.';
  } 
  else if (containerType === 'recent-quizzes' || container.classList.contains('recent-quizzes')) {
    icon = 'clipboard-list';
    title = 'No Recent Quizzes';
    description = 'You haven\'t taken any quizzes recently. Complete quizzes to see them listed here!';
  } 
  else if (containerType === 'achievements-container' || container.classList.contains('achievements-container')) {
    icon = 'award';
    title = 'No Achievements Yet';
    description = 'Complete quizzes to unlock achievements! Achievements are awarded for great performance and consistency.';
  } 
  else {
    // Default message
    icon = 'info-circle';
    title = 'No Data Available';
    description = 'There\'s no data to display at the moment. Check back later!';
  }
  
  // Show a preview of what's coming for achievements
  if ((containerType === 'achievements-container' || container.classList.contains('achievements-container')) && !errorMessage) {
    noDataEl.innerHTML = `
      <div class="no-data-content">
        <i class="fas fa-${icon}"></i>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <div class="locked-achievements-preview">
        <h4>Locked Achievements</h4>
        <div class="locked-achievements">
          <div class="locked-achievement">
            <div class="locked-icon"><i class="fas fa-trophy"></i></div>
            <div class="locked-info">
              <div class="locked-title">Perfect Score</div>
              <div class="locked-desc">Get 100% on any quiz</div>
            </div>
          </div>
          <div class="locked-achievement">
            <div class="locked-icon"><i class="fas fa-graduation-cap"></i></div>
            <div class="locked-info">
              <div class="locked-title">Subject Mastery</div>
              <div class="locked-desc">Score 90%+ in 5 quizzes</div>
            </div>
          </div>
          <div class="locked-achievement">
            <div class="locked-icon"><i class="fas fa-fire"></i></div>
            <div class="locked-info">
              <div class="locked-title">Quiz Streak</div>
              <div class="locked-desc">Complete 3 quizzes in a week</div>
            </div>
          </div>
        </div>
      </div>
    `;
  } 
  // Show a preview of upcoming classes
  else if ((containerType === 'class-performance' || container.classList.contains('class-performance')) && !errorMessage) {
    noDataEl.innerHTML = `
      <div class="no-data-content">
        <i class="fas fa-${icon}"></i>
        <h3>${title}</h3>
        <p>${description}</p>
        <a href="/classrooms" class="action-button">
          <i class="fas fa-search"></i> Browse Classes
        </a>
      </div>
    `;
  }
  // Error message
  else if (errorMessage) {
    noDataEl.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <h3>${title}</h3>
      <p>${description}</p>
      <button class="retry-button" onclick="fetchUserData()">
        <i class="fas fa-sync"></i> Retry
      </button>
    `;
  }
  // Default no-data message
  else {
    noDataEl.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <h3>${title}</h3>
      <p>${description}</p>
    `;
  }
  
  // Find a good place to insert the message
  // First try to maintain headers if they exist
  const header = container.querySelector('h3, .card-title');
  if (header) {
    // Clear everything except header
    const currentChildren = Array.from(container.childNodes);
    currentChildren.forEach(child => {
      if (child !== header) {
        container.removeChild(child);
      }
    });
    
    // Add the no data message after header
    container.appendChild(noDataEl);
  } else {
    // No header, just add to container
    container.appendChild(noDataEl);
  }
}

// Add a global error handler function for chart operations
function safelyExecuteChartFunction(functionName, data, errorMessage) {
  try {
    // Call the function with the provided data
    if (typeof window[functionName] === 'function') {
      window[functionName](data);
    } else if (typeof this[functionName] === 'function') {
      this[functionName](data);
    } else {
      console.error(`Function ${functionName} is not defined`);
    }
  } catch (error) {
    console.error(`Error in ${functionName}:`, error);
    showToast(errorMessage || `Error in ${functionName}. Please refresh the page.`, 'error');
  }
}

// Use the safe execution wrapper in displayAllCharts
function displayAllCharts(data) {
  console.log('Displaying all charts with data:', data);
  
  // Handle empty data case
  if (!data || (!data.quizzes && !data.quizProgression)) {
    const containers = document.querySelectorAll('.chart-container, .performance-summary, .class-performance, .recent-quizzes, .achievements-container');
    containers.forEach(container => {
      displayNoDataMessage(container, 'No quiz data available');
    });
    return;
  }
  
  // Safely execute each chart function with appropriate error messages
  safelyExecuteChartFunction('updatePerformanceSummary', data, 'Error updating performance summary.');
  safelyExecuteChartFunction('createPerformanceChart', data, 'Error creating performance chart.');
  safelyExecuteChartFunction('displayClassPerformance', data, 'Error displaying class performance.');
  safelyExecuteChartFunction('displayRecentQuizzes', data, 'Error displaying recent quizzes.');
  safelyExecuteChartFunction('displayAchievements', data, 'Error displaying achievements.');
}

// Create and update performance summary cards
function updatePerformanceSummary(data) {
  const container = document.querySelector('.performance-summary');
  if (!container) return;
  
  // Remove loading spinner
  container.querySelectorAll('.loading-spinner').forEach(el => el.remove());
  
  // Clear existing content
  container.innerHTML = '';
  
  // Check if we have stats
  if (!data.overallStats) {
    const noData = document.createElement('div');
    noData.className = 'no-data';
    noData.textContent = 'No performance data available';
    container.appendChild(noData);
    return;
  }
  
  // Count active classrooms
  const activeClassrooms = data.classrooms.filter(c => c.quizzesAttempted > 0).length;
  
  // Create summary cards
  const stats = [
    {
      label: 'Quizzes Attempted',
      value: `${data.overallStats.quizzesAttempted}/${data.overallStats.totalQuizzes}`,
      icon: 'fa-tasks'
    },
    {
      label: 'Average Score',
      value: `${data.overallStats.averageScore.toFixed(1)}%`,
      icon: 'fa-chart-line'
    },
    {
      label: 'Active Classes',
      value: `${activeClassrooms}/${data.classrooms.length}`,
      icon: 'fa-users'
    },
    {
      label: 'Best Subject',
      value: getBestSubject(data),
      icon: 'fa-award'
    }
  ];
  
  stats.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="summary-value">${stat.value}</div>
      <div class="summary-label"><i class="fas ${stat.icon}"></i> ${stat.label}</div>
    `;
    container.appendChild(card);
  });
}

// Get the name of the best performing subject
function getBestSubject(data) {
  if (!data.bySubject || Object.keys(data.bySubject).length === 0) {
    return 'N/A';
  }
  
  let bestSubject = null;
  let bestScore = -1;
  
  Object.values(data.bySubject).forEach(subject => {
    if (subject.averageScore > bestScore && subject.quizzesAttempted > 0) {
      bestScore = subject.averageScore;
      bestSubject = subject.name;
    }
  });
  
  return bestSubject || 'N/A';
}

// Display recent quizzes
function displayRecentQuizzes(data) {
  // Find the container - in some places it might be different
  let container = document.querySelector('.recent-quizzes');
  
  if (!container) {
    // Try to find the container in a different way - look for a card with Recent Quizzes title
    const recentQuizzesCard = Array.from(document.querySelectorAll('.info-card'))
      .find(card => {
        const title = card.querySelector('.card-title');
        return title && title.textContent.includes('Recent Quizzes');
      });
    
    if (recentQuizzesCard) {
      // Clear any existing content except the card title
      const contentToRemove = recentQuizzesCard.querySelectorAll('.no-data, .loading-spinner, .elegant-loader, .recent-quizzes');
      contentToRemove.forEach(el => el.remove());
      
      // Create new container
      container = document.createElement('div');
      container.className = 'recent-quizzes';
      recentQuizzesCard.appendChild(container);
    } else {
      console.error('Recent quizzes container not found');
      return;
    }
  } else {
    // Clear the container if it exists
    container.innerHTML = '';
  }

  // Check if we have quiz data
  if (!data || (!data.quizzes && !data.recentQuizzes) || 
      (data.quizzes && data.quizzes.length === 0 && 
       data.recentQuizzes && data.recentQuizzes.length === 0)) {
    container.innerHTML = `
      <div class="no-data">
        <i class="fas fa-clipboard-list"></i>
        <h3>No Recent Quizzes</h3>
        <p>Start taking quizzes to see your recent activity here!</p>
      </div>
    `;
    return;
  }

  // Sort quizzes by date (newest first) and get the most recent 5
  const recentQuizzes = data.recentQuizzes && data.recentQuizzes.length > 0 
    ? [...data.recentQuizzes] 
    : (data.quizzes ? [...data.quizzes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5) : []);

  // Create an element for each quiz
  recentQuizzes.forEach((quiz, index) => {
    const date = new Date(quiz.date);
    const formattedDate = formatDate(date);
    
    // Calculate score percentage
    const scorePercentage = quiz.maxScore ? Math.round((quiz.score / quiz.maxScore) * 100) : 0;
    
    // Get score class based on percentage
    let scoreClass = '';
    if (scorePercentage >= 90) scoreClass = 'excellent';
    else if (scorePercentage >= 80) scoreClass = 'good';
    else if (scorePercentage >= 70) scoreClass = 'fair';
    else if (scorePercentage >= 60) scoreClass = 'poor';
    else scoreClass = 'fail';

    // Get classroom name using helper function
    const classroomName = getClassroomName(data.classrooms, quiz.classroomId) || 'Unknown Class';
    
    // Create the quiz card with animation delay
    const quizCard = document.createElement('div');
    quizCard.className = 'quiz-item';
    quizCard.style.animationDelay = `${index * 0.1}s`;
    
    // Fill in the card content
    quizCard.innerHTML = `
      <div class="quiz-header">
        <h4 class="quiz-title">${quiz.title || 'Untitled Quiz'}</h4>
        <div class="quiz-score ${scoreClass}">${scorePercentage}%</div>
      </div>
      <div class="quiz-details">
        <div class="quiz-subject">
          <i class="fas fa-book"></i>
          <span>${classroomName}</span>
        </div>
        <div class="quiz-date">
          <i class="far fa-calendar-alt"></i>
          <span>${formattedDate}</span>
        </div>
      </div>
    `;
    
    // Add click handler to navigate to quiz details/results (if needed)
    quizCard.addEventListener('click', () => {
      if (quiz._id) {
        window.location.href = `quiz-results?quiz=${quiz._id}&classroom=${quiz.classroomId}`;
      }
    });
    
    container.appendChild(quizCard);
  });
}

// Function to generate achievements based on user performance
function generateAchievements(data) {
  if (!data) {
    return [];
  }
  
  // Get quizzes from either data.quizzes or data.quizProgression
  let quizzes = [];
  
  if (data.quizzes && data.quizzes.length > 0) {
    quizzes = data.quizzes;
  } else if (data.quizProgression && data.quizProgression.length > 0) {
    quizzes = data.quizProgression;
  } else if (data.recentQuizzes && data.recentQuizzes.length > 0) {
    quizzes = data.recentQuizzes;
  }
  
  if (quizzes.length === 0) {
    return [];
  }
  
  const achievements = [];
  
  // Calculate some overall stats
  const totalQuizzes = quizzes.length;
  
  console.log('Checking for perfect scores among', totalQuizzes, 'quizzes');
  
  const perfectScores = quizzes.filter(q => {
    const isPerfect = q.score === q.maxScore && q.maxScore > 0;
    if (isPerfect) {
      console.log('Perfect score found:', q.title, q.score, '/', q.maxScore);
    }
    return isPerfect;
  }).length;
  
  // Get high score quizzes (90%+)
  const highScoreQuizzes = quizzes.filter(q => {
    if (!q.maxScore || q.maxScore === 0) return false;
    const percentage = (q.score / q.maxScore) * 100;
    return percentage >= 90;
  }).length;
  
  // Get good score quizzes (80%+)
  const goodScoreQuizzes = quizzes.filter(q => {
    if (!q.maxScore || q.maxScore === 0) return false;
    const percentage = (q.score / q.maxScore) * 100;
    return percentage >= 80;
  }).length;
  
  // Group quizzes by classroom for subject mastery
  const byClassroom = {};
  quizzes.forEach(quiz => {
    if (quiz.classroomId) {
      if (!byClassroom[quiz.classroomId]) {
        byClassroom[quiz.classroomId] = [];
      }
      byClassroom[quiz.classroomId].push(quiz);
    }
  });
  
  // Generate Perfect Score Achievements (Bronze, Silver, Gold)
  if (perfectScores >= 1) {
    achievements.push({
      title: 'Perfect Score',
      description: 'Achieved a perfect score on a quiz! Your attention to detail and mastery of the material is outstanding.',
      level: perfectScores >= 5 ? 'gold' : perfectScores >= 3 ? 'silver' : 'bronze',
      icon: 'fa-star',
      date: new Date().toISOString(), // Use most recent perfect score date
      stats: [
        { label: 'Perfect Scores', value: `${perfectScores}` },
        { label: 'Total Quizzes', value: `${totalQuizzes}` }
      ],
      progress: Math.min(perfectScores / 5 * 100, 100) // 5 perfect scores for 100%
    });
  }
  
  // First Quiz Achievement (Always awarded when at least 1 quiz is taken)
  if (totalQuizzes >= 1) {
    achievements.push({
      title: 'First Steps',
      description: 'You completed your first quiz! This is the beginning of your learning journey.',
      level: 'bronze',
      icon: 'fa-flag-checkered',
      date: new Date().toISOString(),
      stats: [
        { label: 'Quizzes Completed', value: `${totalQuizzes}` }
      ],
      progress: 100
    });
  }
  
  // Quiz Explorer Achievement (Based on number of quizzes taken)
  if (totalQuizzes >= 3) {
    achievements.push({
      title: 'Quiz Explorer',
      description: 'You\'ve shown dedication by completing multiple quizzes across your subjects.',
      level: totalQuizzes >= 10 ? 'gold' : totalQuizzes >= 5 ? 'silver' : 'bronze',
      icon: 'fa-compass',
      date: new Date().toISOString(),
      stats: [
        { label: 'Quizzes Completed', value: `${totalQuizzes}` }
      ],
      progress: Math.min(totalQuizzes / 10 * 100, 100) // 10 quizzes for 100%
    });
  }
  
  // Early Bird Achievement (If any quiz was completed within 24 hours of being assigned)
  const earlyQuizzes = quizzes.filter(q => {
    if (!q.startTime || !q.date) return false;
    // Check if quiz was completed within 24 hours of starting
    const startTime = new Date(q.startTime);
    const completionTime = new Date(q.date);
    const hoursDifference = (completionTime - startTime) / (1000 * 60 * 60);
    return hoursDifference <= 24;
  }).length;
  
  if (earlyQuizzes >= 1) {
    achievements.push({
      title: 'Early Bird',
      description: 'You\'re quick to complete quizzes! Tackling assignments early shows excellent time management.',
      level: earlyQuizzes >= 5 ? 'gold' : earlyQuizzes >= 3 ? 'silver' : 'bronze',
      icon: 'fa-clock',
      date: new Date().toISOString(),
      stats: [
        { label: 'Quick Completions', value: `${earlyQuizzes}` }
      ],
      progress: Math.min(earlyQuizzes / 5 * 100, 100)
    });
  }
  
  // Consistency Achievement (Based on taking quizzes regularly)
  if (totalQuizzes >= 3) {
    achievements.push({
      title: 'Consistency Champion',
      description: 'You\'ve shown dedication by regularly taking quizzes, which is key to long-term learning success.',
      level: totalQuizzes >= 8 ? 'gold' : totalQuizzes >= 5 ? 'silver' : 'bronze',
      icon: 'fa-calendar-check',
      date: new Date().toISOString(),
      stats: [
        { label: 'Quizzes Completed', value: `${totalQuizzes}` }
      ],
      progress: Math.min(totalQuizzes / 8 * 100, 100)
    });
  }
  
  // Academic Excellence Achievement (Based on 80%+ scores)
  if (goodScoreQuizzes >= 2) {
    achievements.push({
      title: 'Academic Excellence',
      description: 'You consistently score high on your quizzes, demonstrating excellent understanding of the material.',
      level: goodScoreQuizzes >= 7 ? 'gold' : goodScoreQuizzes >= 4 ? 'silver' : 'bronze',
      icon: 'fa-award',
      date: new Date().toISOString(),
      stats: [
        { label: 'High Scores', value: `${goodScoreQuizzes}` },
        { label: 'Total Quizzes', value: `${totalQuizzes}` }
      ],
      progress: Math.min(goodScoreQuizzes / 7 * 100, 100)
    });
  }
  
  // Generate Subject Mastery Achievements based on average scores in subjects
  Object.entries(byClassroom).forEach(([classroomId, classQuizzes]) => {
    if (classQuizzes.length < 2) return; // Need at least 2 quizzes
    
    const avgScore = classQuizzes.reduce((sum, q) => 
      sum + (q.score / (q.maxScore || 1) * 100), 0
    ) / classQuizzes.length;
    
    const classroomName = getClassroomName(data.classrooms, classroomId) || 'Unknown Subject';
    
    if (avgScore >= 85) {
      achievements.push({
        title: `${classroomName} Master`,
        description: `You've demonstrated exceptional understanding in ${classroomName} with consistently high scores.`,
        level: avgScore >= 90 ? 'gold' : 'silver',
        icon: 'fa-graduation-cap',
        date: new Date(Math.max(...classQuizzes.map(q => new Date(q.date)))).toISOString(),
        stats: [
          { label: 'Average Score', value: `${Math.round(avgScore)}%` },
          { label: 'Quizzes Completed', value: classQuizzes.length }
        ],
        progress: Math.min((avgScore - 85) / 15 * 100, 100) // 85-100% maps to 0-100% progress
      });
    }
  });
  
  // Quiz Streak Achievement
  if (totalQuizzes >= 3) {
    // Sort quizzes by date
    const sortedQuizzes = [...quizzes].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate longest streak (quizzes within a week of each other)
    let currentStreak = 1;
    let longestStreak = 1;
    
    for (let i = 1; i < sortedQuizzes.length; i++) {
      const daysBetween = (new Date(sortedQuizzes[i].date) - new Date(sortedQuizzes[i-1].date)) / (1000 * 60 * 60 * 24);
      
      if (daysBetween <= 7) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    
    if (longestStreak >= 3) {
      achievements.push({
        title: 'Streak Master',
        description: 'You maintained an impressive streak of completing quizzes within consecutive weeks!',
        level: longestStreak >= 7 ? 'gold' : longestStreak >= 5 ? 'silver' : 'bronze',
        icon: 'fa-fire',
        date: new Date().toISOString(),
        stats: [
          { label: 'Longest Streak', value: `${longestStreak} quizzes` }
        ],
        progress: Math.min(longestStreak / 7 * 100, 100) // 7 quizzes for 100%
      });
    }
  }

  // High Performance Achievement
  if (highScoreQuizzes >= 3) {
    achievements.push({
      title: 'Star Performer',
      description: 'You consistently score 90% or higher on your quizzes, demonstrating exceptional understanding of the material.',
      level: highScoreQuizzes >= 7 ? 'gold' : 'silver',
      icon: 'fa-trophy',
      date: new Date().toISOString(),
      stats: [
        { label: 'High Scores', value: `${highScoreQuizzes}` },
        { label: 'Total Quizzes', value: `${totalQuizzes}` }
      ],
      progress: Math.min(highScoreQuizzes / 7 * 100, 100) // 7 high scores for 100%
    });
  }
  
  // Improvement Achievement
  if (totalQuizzes >= 5) {
    // Calculate average score of first 3 and last 3 quizzes
    const sortedQuizzes = [...quizzes].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const firstThree = sortedQuizzes.slice(0, 3);
    const lastThree = sortedQuizzes.slice(-3);
    
    const firstAvg = firstThree.reduce((sum, q) => 
      sum + (q.score / (q.maxScore || 1) * 100), 0
    ) / firstThree.length;
    
    const lastAvg = lastThree.reduce((sum, q) => 
      sum + (q.score / (q.maxScore || 1) * 100), 0
    ) / lastThree.length;
    
    const improvement = lastAvg - firstAvg;
    
    if (improvement >= 10) {
      achievements.push({
        title: 'Rising Star',
        description: 'You\'ve shown remarkable improvement in your quiz performance over time!',
        level: improvement >= 15 ? 'gold' : 'silver',
        icon: 'fa-chart-line',
        date: new Date().toISOString(),
        stats: [
          { label: 'Improvement', value: `+${Math.round(improvement)}%` },
          { label: 'Current Average', value: `${Math.round(lastAvg)}%` }
        ],
        progress: Math.min(improvement / 20 * 100, 100) // 20% improvement for 100%
      });
    }
  }
  
  // Sort achievements by level (gold, silver, bronze)
  return achievements.sort((a, b) => {
    const levelOrder = { gold: 0, silver: 1, bronze: 2 };
    return levelOrder[a.level] - levelOrder[b.level];
  });
}

// Display achievements on the profile page
function displayAchievements(data) {
  // Find the achievements container
  let container = document.querySelector('.achievements-container');
  
  if (!container) {
    // Try to find the container in a different way - look for the achievements card
    const achievementsCard = Array.from(document.querySelectorAll('.info-card'))
      .find(card => {
        const title = card.querySelector('.card-title');
        return title && title.textContent.includes('Achievements');
      });
    
    if (achievementsCard) {
      // Clear existing content
      const contentToRemove = achievementsCard.querySelectorAll('.no-data, .loading-spinner, .elegant-loader, .achievements-container');
      contentToRemove.forEach(el => el.remove());
      
      // Create new container
      container = document.createElement('div');
      container.className = 'achievements-container';
      achievementsCard.appendChild(container);
    } else {
      console.error('Achievements container not found');
      return;
    }
  } else {
    // Clear the container if it exists
    container.innerHTML = '';
  }
  
  // Generate achievements
  const achievements = generateAchievements(data);
  
  // Check if we have achievements
  if (!achievements || achievements.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        <i class="fas fa-medal"></i>
        <h3>No Achievements Yet</h3>
        <p>Complete more quizzes to unlock achievements and track your progress!</p>
        
        <div class="locked-achievements-preview">
          <div class="achievement-card achievement-locked">
            <div class="achievement-icon-wrapper">
              <div class="achievement-icon">
                <i class="fas fa-lock achievement-lock-icon"></i>
              </div>
            </div>
            <div class="achievement-content">
              <div class="achievement-title">Perfect Score</div>
              <div class="achievement-description">Score 100% on a quiz to unlock this achievement</div>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  // Add achievements summary at the top
  const goldCount = achievements.filter(a => a.level === 'gold').length;
  const silverCount = achievements.filter(a => a.level === 'silver').length;
  const bronzeCount = achievements.filter(a => a.level === 'bronze').length;
  
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'achievements-summary';
  summaryDiv.innerHTML = `
    <div class="medal-counts">
      <div class="medal gold">
        <i class="fas fa-medal"></i>
        <span>${goldCount}</span>
      </div>
      <div class="medal silver">
        <i class="fas fa-medal"></i>
        <span>${silverCount}</span>
      </div>
      <div class="medal bronze">
        <i class="fas fa-medal"></i>
        <span>${bronzeCount}</span>
      </div>
    </div>
    <div class="total-achievements">
      ${achievements.length} Achievement${achievements.length !== 1 ? 's' : ''} Unlocked
    </div>
  `;
  container.appendChild(summaryDiv);
  
  // Create achievement cards container with grid layout
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'achievement-cards-grid';
  container.appendChild(cardsContainer);
  
  // Create achievement cards
  achievements.forEach((achievement, index) => {
    const card = document.createElement('div');
    card.className = `achievement-card ${achievement.level}`;
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
      <div class="achievement-header">
        <div class="achievement-level-badge ${achievement.level}">${achievement.level}</div>
      </div>
      <div class="achievement-icon-wrapper">
        <div class="achievement-icon ${achievement.level}">
          <i class="fas ${achievement.icon}"></i>
        </div>
      </div>
      <div class="achievement-content">
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-description">${achievement.description}</div>
        
        <div class="achievement-stats">
          ${achievement.stats.map(stat => 
            `<div class="achievement-stat">
              <span class="stat-label">${stat.label}:</span>
              <span class="stat-value">${stat.value}</span>
            </div>`
          ).join('')}
        </div>
        
        <div class="achievement-progress-container">
          <div class="achievement-progress-bar" style="width: ${achievement.progress}%"></div>
        </div>
        
        <div class="achievement-date">
          <i class="far fa-calendar-check"></i>
          <span>${formatDate(new Date(achievement.date))}</span>
        </div>
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });
  
  // Add improved CSS for achievements
  if (!document.querySelector('style#achievement-styles')) {
    const style = document.createElement('style');
    style.id = 'achievement-styles';
    style.textContent = `
      .achievements-container {
        padding: 10px;
        display: flex;
        flex-direction: column;
        width: 100%;
      }
      
      .achievements-summary {
        background: linear-gradient(135deg,rgb(9, 72, 114),rgb(93, 50, 96));
        color: white;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
      
      .medal-counts {
        display: flex;
        gap: 20px;
      }
      
      .medal {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .medal i {
        font-size: 24px;
        margin-bottom: 5px;
      }
      
      .medal span {
        font-weight: 700;
        font-size: 18px;
      }
      
      .medal.gold i { color: #FFC107; }
      .medal.silver i { color: #E0E0E0; }
      .medal.bronze i { color: #CD7F32; }
      
      .total-achievements {
        font-weight: 600;
        font-size: 18px;
      }
      
      .achievement-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        width: 100%;
      }
      
      .achievement-card {
        position: relative;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        padding: 20px;
        transition: transform 0.3s, box-shadow 0.3s;
        animation: fadeIn 0.5s ease forwards;
        opacity: 0;
        overflow: hidden;
        border-top: 5px solid #9e9e9e;
      }
      
      .achievement-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }
      
      .achievement-card.gold {
        border-top-color: #FFC107;
      }
      
      .achievement-card.silver {
        border-top-color: #9E9E9E;
      }
      
      .achievement-card.bronze {
        border-top-color: #A77044;
      }
      
      .achievement-level-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        text-transform: uppercase;
        font-size: 12px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 20px;
        background: #9e9e9e;
        color: white;
      }
      
      .achievement-level-badge.gold {
        background: linear-gradient(135deg, #FFD700, #FFA000);
      }
      
      .achievement-level-badge.silver {
        background: linear-gradient(135deg, #E0E0E0, #9E9E9E);
      }
      
      .achievement-level-badge.bronze {
        background: linear-gradient(135deg, #CD7F32, #8D6E63);
      }
      
      .achievement-icon-wrapper {
        display: flex;
        justify-content: center;
        margin-bottom: 15px;
        background: white;
      }
      
      .achievement-icon {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      
      .achievement-icon i {
        font-size: 24px;
        color: #616161;
      }
      
      .achievement-icon.gold {
        background: linear-gradient(135deg, #FFD700, #FFA000);
      }
      
      .achievement-icon.silver {
        background: linear-gradient(135deg, #E0E0E0, #9E9E9E);
      }
      
      .achievement-icon.bronze {
        background: linear-gradient(135deg, #CD7F32, #8D6E63);
      }
      
      .achievement-icon.gold i,
      .achievement-icon.silver i,
      .achievement-icon.bronze i {
        color: white;
      }
      
      .achievement-title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 5px;
        color: #333;
      }
      
      .achievement-description {
        color: #666;
        font-size: 14px;
        margin-bottom: 15px;
        line-height: 1.4;
      }
      
      .achievement-stats {
        background: #f9f9f9;
        padding: 10px;
        border-radius: 8px;
        margin-bottom: 15px;
      }
      
      .achievement-stat {
        display: flex;
        justify-content: space-between;
        margin-bottom: 5px;
      }
      
      .stat-label {
        color: #666;
      }
      
      .stat-value {
        font-weight: 600;
        color: #333;
      }
      
      .achievement-progress-container {
        height: 8px;
        background: #f0f0f0;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 15px;
      }
      
      .achievement-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #8BC34A);
        border-radius: 4px;
        transition: width 1s ease;
      }
      
      .achievement-date {
        font-size: 12px;
        color: #999;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .locked-achievements-preview {
        display: flex;
        justify-content: center;
        margin-top: 20px;
        opacity: 0.7;
      }
      
      .locked-achievements-preview .achievement-card {
        max-width: 280px;
      }
      
      .achievement-locked .achievement-icon {
        background: #e0e0e0;
        opacity: 0.7;
      }
      
      .achievement-lock-icon {
        color: #9e9e9e;
      }
    `;
    document.head.appendChild(style);
  }
}

function createPerformanceChart(data) {
  if (!data || !data.quizProgression || data.quizProgression.length === 0) {
    return;
  }

  // Get user preferences for chart display
  const preferences = JSON.parse(localStorage.getItem('chartPreferences')) || {
    metric: 'percentage',
    classroomFilter: []
  };
  
  // Get the selected metric
  const metricType = preferences.metric || 'percentage';
  
  // Sort quizzes by date
  const sortedQuizzes = [...data.quizProgression].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Cache classrooms for getClassroomName function
  window.cachedClassrooms = data.classrooms || [];
  
  // Create date map to handle multiple quizzes on same date
  const dateCountMap = new Map();
  
  // Process quiz data
  const quizDates = [];
  const quizScores = [];
  const tooltipData = [];
  
  sortedQuizzes.forEach(quiz => {
    const dateString = formatDate(quiz.date);
    
    // Count quizzes on the same date
    if (!dateCountMap.has(dateString)) {
      dateCountMap.set(dateString, 1);
  } else {
      dateCountMap.set(dateString, dateCountMap.get(dateString) + 1);
    }
    
    const count = dateCountMap.get(dateString);
    // Create a unique label including quiz number if needed
    const label = count > 1 ? `${dateString} (Quiz ${count})` : dateString;
    
    quizDates.push(label);
    
    // Calculate score based on metricType
    let score = 0;
    if (metricType === 'percentage') {
      if (quiz.score !== undefined && quiz.maxScore !== undefined && quiz.maxScore > 0) {
        score = Math.round((quiz.score / quiz.maxScore) * 100);
      } else if (quiz.percentage !== undefined) {
        score = quiz.percentage;
      }
    } else if (metricType === 'raw') {
      score = quiz.score || 0;
    } else if (metricType === 'percentile') {
      score = quiz.percentile || 0;
    }
    
    quizScores.push(score);
    
    // Store data for tooltip
    tooltipData.push({
      title: quiz.title || 'Unnamed Quiz',
      score: score,
      date: dateString,
      classroomName: getClassroomName(data.classrooms, quiz.classroomId)
    });
  });
  
  // Get the canvas
  const canvas = document.getElementById('performanceChart');
  if (!canvas) {
    console.error('Performance chart canvas not found');
    return;
  }
  
  // Clear any existing chart
  if (window.performanceChart) {
    try {
      if (window.performanceChart instanceof Chart) {
        window.performanceChart.destroy();
      }
    } catch (e) {
      console.warn('Error destroying previous chart:', e);
    }
  }
  
  // Set chart color based on average score
  const avgScore = quizScores.length > 0 ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : 0;
  const chartColor = getColorForScore(avgScore);
  
  // Calculate trendline
  const xValues = Array.from({length: quizDates.length}, (_, i) => i);
  const trendlinePoints = calculateTrendline(xValues, quizScores);
  
  // Create a gradient background
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, chartColor.replace('0.8', '0.6'));
  gradient.addColorStop(1, chartColor.replace('0.8', '0.1'));
  
  // Get appropriate y-axis label
  const yAxisLabel = metricType === 'percentage' ? 'Score (%)' : 
                    metricType === 'raw' ? 'Raw Score' : 
                    'Percentile';
  
  // Create chart
  window.performanceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: quizDates,
      datasets: [
        {
          label: 'Quiz Performance',
          data: quizScores,
          backgroundColor: gradient,
          borderColor: chartColor,
          borderWidth: 3,
          pointBackgroundColor: chartColor,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointStyle: 'circle', // Ensure perfectly round points
          fill: true,
          tension: 0.3
        },
        {
          label: 'Trend',
          data: trendlinePoints,
          borderColor: 'rgba(100, 100, 100, 0.5)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0,
          tooltipHidden: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          },
          title: {
            display: true,
            text: 'Quiz Date'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          beginAtZero: true,
          max: metricType === 'percentage' || metricType === 'percentile' ? 100 : undefined,
          title: {
            display: true,
            text: yAxisLabel
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          titleColor: '#333',
          bodyColor: '#666',
          borderColor: '#ddd',
          borderWidth: 1,
          titleFont: {
            weight: 'bold'
          },
          callbacks: {
            title: function(context) {
              // Use the quiz title as the tooltip title
              return tooltipData[context[0].dataIndex].title;
            },
            label: function(context) {
              const data = tooltipData[context.dataIndex];
              return [
                `${yAxisLabel}: ${data.score}`,
                `Class: ${data.classroomName}`,
                `Date: ${data.date}`
              ];
            },
            labelTextColor: function(context) {
              return '#666';
            }
          }
        }
      },
      elements: {
        point: {
          pointStyle: 'circle'
        }
      }
    }
  });
  
  // Add performance insights below the chart
  // Calculate the trend slope
  const trendSlope = calculateTrendSlope(xValues, quizScores);
  // Use quizScores instead of sortedQuizzes and pass the calculated trendSlope
  displayPerformanceInsights(canvas.parentElement, quizScores, trendSlope);
}

// Helper to get classroom name by ID
function getClassroomName(classrooms, classroomId) {
  if (!classroomId || !classrooms || !Array.isArray(classrooms)) {
    return 'Unknown Classroom';
  }
  
  // Convert classroomId to string for comparison
  const searchId = classroomId.toString();
  
  // Look for a classroom with a matching ID
  const classroom = classrooms.find(c => {
    // Handle various ID formats
    if (!c) return false;
    
    // Direct ID match
    if (c.id && c.id.toString() === searchId) {
      return true;
    }
    
    // MongoDB _id match
    if (c._id && c._id.toString() === searchId) {
      return true;
    }
    
    // Nested _id in id field
    if (c.id && c.id._id && c.id._id.toString() === searchId) {
      return true;
    }
    
    return false;
  });
  
  // Return the classroom name or a default - check for className first as that's used in the API
  return classroom ? (classroom.className || classroom.name || classroom.title || 'Unnamed Classroom') : 'Unknown Classroom';
}

// Main initialization function
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing student profile page...');
  
  // Check for specific URL parameters
  const classId = getUrlParameter('classId');
  if (classId) {
    console.log('Specific class requested:', classId);
  }
  
  // Setup profile dropdown functionality
  const profileIcon = document.querySelector('.profile-icon');
  const profileDropdown = document.querySelector('.profile-dropdown');
  if (profileIcon && profileDropdown) {
    profileIcon.addEventListener('click', function(event) {
      event.stopPropagation();
      profileDropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', function(event) {
      if (!profileIcon.contains(event.target)) {
        profileDropdown.classList.remove('show');
      }
    });
  }
  
  // UI interactions setup
  setupTabs();
  setupProfileModal();
  
  // Show elegant loaders instead of ugly ones
  replaceLoadingSpinners();
  
  // Fetch profile data
  fetchUserProfile();
  
  // Fetch classrooms and quiz data
  fetchUserData();
});

// Replace ugly loading spinners with elegant ones
function replaceLoadingSpinners() {
  document.querySelectorAll('.loading-spinner').forEach(spinner => {
    const elegantLoader = document.createElement('div');
    elegantLoader.className = 'elegant-loader';
    elegantLoader.innerHTML = `
      <div class="loader-ring">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <p>Loading...</p>
    `;
    spinner.parentNode.replaceChild(elegantLoader, spinner);
  });
}

// Setup tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Add click handler to each tab
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class to selected tab and content
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // Resize charts if they exist
      if (window.performanceChart) {
        setTimeout(() => {
          window.performanceChart.resize();
        }, 50);
      }
    });
  });
}

// Setup profile modal
function setupProfileModal() {
  const editProfileBtn = document.querySelector('.edit-profile-btn');
  const modal = document.getElementById('profileModal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.querySelector('.cancel-btn');
  const profileForm = document.getElementById('profileForm');
  
  if (editProfileBtn && modal) {
    // Open modal
    editProfileBtn.addEventListener('click', () => {
      modal.classList.add('show');
    });
    
    // Close modal handlers
    if (closeModal) {
      closeModal.addEventListener('click', () => {
        modal.classList.remove('show');
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
      });
    }
    
    // Close on click outside
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
    
    // Handle form submission
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        updateUserProfile();
      });
    }
  }
}

// Fetch user profile data
function fetchUserProfile() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (!token) {
    showToast('Please log in to view your profile.', 'error');
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
    return;
  }
  
  fetch('/api/profile', {
    headers: getAuthHeader()
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to fetch profile data');
    }
    return response.json();
  })
  .then(userData => {
    // Update profile info
    updateProfileInfo(userData);
    
    // Pre-fill modal form
    prefillProfileForm(userData);
  })
  .catch(error => {
    console.error('Error fetching profile:', error);
    showToast('Could not load profile data. Please refresh the page.', 'error');
  });
}

// Update profile information on the page
function updateProfileInfo(userData) {
  // Log the user data for debugging
  console.log('Updating profile info with data:', userData);

  // Handle both name fields (some backends use 'name' while others use 'fullName')
  const userName = userData.fullName || userData.name || 'Student';
  
  // Set name
  const nameElements = document.querySelectorAll('.profile-name');
  nameElements.forEach(el => {
    el.textContent = userName;
  });
  
  // Set title/role
  const titleElements = document.querySelectorAll('.profile-title');
  titleElements.forEach(el => {
    el.textContent = userData.title || 'Student';
  });
  
  // Update profile avatar if available
  const avatarElements = document.querySelectorAll('.profile-avatar');
  if (userData.profileImage) {
    avatarElements.forEach(el => {
      el.src = userData.profileImage;
    });
  }
  
  // Set contact info
  const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
  if (contactItems.length >= 3) {
    // Email
    contactItems[0].textContent = userData.email || 'No email provided';
    
    // Phone
    contactItems[1].textContent = userData.phone || 'No phone provided';
    
    // Institution
    contactItems[2].textContent = userData.institution || 'No institution provided';
    
    // Student ID if available
    if (contactItems.length >= 4) {
      contactItems[3].textContent = userData.studentId ? `Student ID: ${userData.studentId}` : 'Student ID: Not available';
    }
    
    // Join date if available
    if (contactItems.length >= 5) {
      let joinDate;
      if (userData.createdAt) {
        joinDate = new Date(userData.createdAt);
      } else if (userData.created_at) {
        joinDate = new Date(userData.created_at);
      } else if (userData.joinDate) {
        joinDate = new Date(userData.joinDate);
      } else {
        joinDate = new Date(); // Fallback
      }
      
      const formattedDate = joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      contactItems[4].textContent = `Joined: ${formattedDate}`;
    }
  } else {
    console.warn('Contact items not found in profile sidebar');
  }
}

// Pre-fill profile form fields in the modal
function prefillProfileForm(userData) {
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const institutionInput = document.getElementById('institution');
  const titleInput = document.getElementById('title');
  
  if (fullNameInput) fullNameInput.value = userData.fullName || '';
  if (emailInput) emailInput.value = userData.email || '';
  if (phoneInput) phoneInput.value = userData.phone || '';
  if (institutionInput) institutionInput.value = userData.institution || '';
  if (titleInput) titleInput.value = userData.title || '';
}

// Update user profile
function updateUserProfile() {
  const fullName = document.getElementById('fullName').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const institution = document.getElementById('institution').value;
  const title = document.getElementById('title').value;
  
  fetch('/api/profile', {
    method: 'PUT',
    headers: {
      ...getAuthHeader()
    },
    body: JSON.stringify({
      fullName, 
      email, 
      phone, 
      institution, 
      title
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to update profile');
    }
    return response.json();
  })
  .then(data => {
    showToast('Profile updated successfully!', 'success');
    
    // Close modal
    document.getElementById('profileModal').classList.remove('show');
    
    // Update profile display
    updateProfileInfo({
      fullName, 
      email, 
      phone, 
      institution, 
      title
    });
  })
  .catch(error => {
    console.error('Error updating profile:', error);
    showToast('Failed to update profile. Please try again.', 'error');
  });
}

// Fetch user's classroom and quiz data
async function fetchUserData() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (!token) {
    console.error('No authentication token found');
    showToast('Please log in to view your profile.', 'error');
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
    return;
  }
  
  console.log('Fetching user classroom and quiz data...');

  // Show loading indicators
  showLoadingIndicator();
  
  // Check if we're in development mode with sample data
  const useSampleData = localStorage.getItem('useSampleData') === 'true' || 
                        window.location.search.includes('sample=true');
  
  if (useSampleData) {
    console.log('Using sample data for development/testing');
    setTimeout(() => {
      hideLoadingIndicator();
      const sampleData = generateSampleData();
      const processedData = processLegacyData(sampleData.classrooms, sampleData.quizzes);
      displayAllCharts(processedData);
      setupTabs();
    }, 1000); // Simulate network delay
    return;
  }
  
  try {
    // First try to fetch user profile info
    const authHeader = { headers: getAuthHeader() };
    const userData = await fetch('/api/user/profile', {
      headers: getAuthHeader()
    }).then(res => res.ok ? res.json() : null);
    
    if (userData) {
      console.log('Retrieved user profile data');
      updateProfileInfo(userData);
    } else {
      console.warn('Could not retrieve user profile data');
    }
    
    // Get the user ID from token
    const userId = getUserIdFromToken();
    if (!userId) {
      console.error('Could not extract user ID from token');
      throw new Error('Authentication problem. Please log in again.');
    }
    
    console.log('User ID from token:', userId);
    
    // Fetch all classrooms
    const classroomsResponse = await fetch('/api/classrooms', {
      headers: getAuthHeader()
    });
    
    if (!classroomsResponse.ok) {
      throw new Error(`Failed to fetch classrooms: ${classroomsResponse.status}`);
    }
    
    // Parse classroom data
    let classroomsData = await classroomsResponse.json();
    
    // Handle different API response structures for classrooms
    let classrooms = [];
    if (Array.isArray(classroomsData)) {
      classrooms = classroomsData;
    } else if (classroomsData.classrooms && Array.isArray(classroomsData.classrooms)) {
      classrooms = classroomsData.classrooms;
    } else if (classroomsData.data && Array.isArray(classroomsData.data)) {
      classrooms = classroomsData.data;
    }
    
    console.log('Retrieved classrooms:', classrooms.length);
    
    // If no classrooms found, show no-data messages and exit
    if (!classrooms || classrooms.length === 0) {
      hideLoadingIndicator();
      displayNoDataMessage('.performance-summary', 'performance-summary');
      displayNoDataMessage('.chart-container', 'chart-container');
      displayNoDataMessage('.class-performance', 'class-performance');
      displayNoDataMessage('.recent-quizzes', 'recent-quizzes');
      displayNoDataMessage('.achievements-container', 'achievements-container');
      return;
    }
    
    // Initialize an array to store all quizzes with student submission data
    let allQuizzes = [];
    
    // Loop through each classroom to get detailed data including quizzes
    for (const classroom of classrooms) {
      const classroomId = classroom.id || classroom._id;
      if (!classroomId) continue;
      
      try {
        // Fetch detailed classroom data with quizzes
        const classroomDetailResponse = await fetch(`/api/classrooms/${classroomId}`, {
          headers: getAuthHeader()
        });
        
        if (!classroomDetailResponse.ok) {
          console.warn(`Failed to fetch detailed data for classroom ${classroomId}: ${classroomDetailResponse.status}`);
          continue;
        }
        
        const classroomDetail = await classroomDetailResponse.json();
        
        // Verify the classroom has quizzes
        if (!classroomDetail.quizzes || !Array.isArray(classroomDetail.quizzes)) {
          console.log(`No quizzes found in classroom ${classroomDetail.className || classroom.name}`);
          continue;
        }
        
        console.log(`Found ${classroomDetail.quizzes.length} quizzes in classroom ${classroomDetail.className || classroom.name}`);
        
        // Loop through each quiz in the classroom
        for (let i = 0; i < classroomDetail.quizzes.length; i++) {
          const quiz = classroomDetail.quizzes[i];
          
          // Skip if quiz is not published
          if (!quiz.published) {
            console.log(`Quiz "${quiz.title}" is not published, skipping`);
            continue;
          }
          
          // Check if this quiz has submissions
          if (!quiz.submissions || !Array.isArray(quiz.submissions)) {
            console.log(`No submissions for quiz "${quiz.title}" in ${classroomDetail.className || classroom.name}`);
            
            // Add as an unattempted quiz for stats
            const unattemptedQuiz = {
              id: quiz.id,
              title: quiz.title || 'Unnamed Quiz',
              classroomId: classroomId,
              classroom: {
                id: classroomId,
                name: classroomDetail.className || classroom.name || 'Unknown Classroom',
                subject: classroomDetail.subject || classroom.subject || 'General'
              },
              date: quiz.startTime || new Date(),
              score: 0,
              maxScore: 100, // Default max score
              percentage: 0,
              status: 'not_attempted',
              isPublished: quiz.published
            };
            
            allQuizzes.push(unattemptedQuiz);
            continue;
          }
          
          // Look for a submission by this student
          let studentSubmission = null;
          for (let j = 0; j < quiz.submissions.length; j++) {
            const submission = quiz.submissions[j];
            
            // Check if this submission belongs to the current user
            if (submission.student_id && submission.student_id.toString() === userId.toString()) {
              studentSubmission = submission;
              break;
            }
          }
          
          if (studentSubmission) {
            console.log(`Found submission for quiz "${quiz.title}" in ${classroomDetail.className || classroom.name}`);
            
            // Create a normalized quiz object with submission data
            const normalizedQuiz = {
              id: quiz.id,
              title: quiz.title || 'Unnamed Quiz',
              classroomId: classroomId,
              classroom: {
                id: classroomId,
                name: classroomDetail.className || classroom.name || 'Unknown Classroom',
                subject: classroomDetail.subject || classroom.subject || 'General'
              },
              // Use student's submission date as the quiz date
              date: studentSubmission.endTime || quiz.startTime || new Date(),
              score: studentSubmission.score || 0,
              maxScore: studentSubmission.maxScore || 100,
              percentage: studentSubmission.percentage || (studentSubmission.score && studentSubmission.maxScore ? 
                         (studentSubmission.score / studentSubmission.maxScore) * 100 : 0),
              status: 'completed',
              isGraded: studentSubmission.isGraded || false,
              startTime: studentSubmission.startTime,
              endTime: studentSubmission.endTime,
              feedback: studentSubmission.feedback || ''
            };
            
            allQuizzes.push(normalizedQuiz);
  } else {
            console.log(`No submission by current student for quiz "${quiz.title}" in ${classroomDetail.className || classroom.name}`);
            
            // Add as an unattempted quiz for stats
            const unattemptedQuiz = {
              id: quiz.id,
              title: quiz.title || 'Unnamed Quiz',
              classroomId: classroomId,
              classroom: {
                id: classroomId,
                name: classroomDetail.className || classroom.name || 'Unknown Classroom',
                subject: classroomDetail.subject || classroom.subject || 'General'
              },
              date: quiz.startTime || new Date(),
              score: 0,
              maxScore: 100, // Default max score
              percentage: 0,
              status: 'not_attempted',
              isPublished: quiz.published
            };
            
            allQuizzes.push(unattemptedQuiz);
          }
        }
      } catch (error) {
        console.error(`Error processing classroom ${classroomId}:`, error);
      }
    }
    
    console.log('Total quizzes processed:', allQuizzes.length);
    
    // If no quizzes found, display appropriate messages
    if (allQuizzes.length === 0) {
      hideLoadingIndicator();
      displayNoDataMessage('.performance-summary', 'performance-summary');
      displayNoDataMessage('.chart-container', 'chart-container');
      
      // Still display classroom cards, even if no quiz data
      const processedData = processLegacyData(classrooms, []);
      displayClassPerformance(processedData);
      displayNoDataMessage('.recent-quizzes', 'recent-quizzes');
      displayNoDataMessage('.achievements-container', 'achievements-container');
      setupTabs();
      return;
    }
    
    // Process data with the quizzes we found
    const processedData = processLegacyData(classrooms, allQuizzes);
    
    // Hide loading indicators
    hideLoadingIndicator();
    
    // Display analytics
    if (processedData.quizProgression.length > 0) {
      displayAllCharts(processedData);
    } else {
      // No quiz data available, show friendly messages
      displayNoDataMessage('.performance-summary', 'performance-summary');
      displayNoDataMessage('.chart-container', 'chart-container');
      
      // Still display classroom cards, even if no quiz data
      displayClassPerformance(processedData);
      displayNoDataMessage('.recent-quizzes', 'recent-quizzes');
      displayNoDataMessage('.achievements-container', 'achievements-container');
    }
    
    // Setup tab interactions
    setupTabs();
    console.log('Profile page data display complete');
    
  } catch (error) {
    console.error('Error fetching or processing user data:', error);
    hideLoadingIndicator();
    
    // Show error messages in each section
    displayNoDataMessage('.performance-summary', 'performance-summary', error.message);
    displayNoDataMessage('.chart-container', 'chart-container', error.message);
    displayNoDataMessage('.class-performance', 'class-performance', error.message);
    displayNoDataMessage('.recent-quizzes', 'recent-quizzes', error.message);
    displayNoDataMessage('.achievements-container', 'achievements-container', error.message);
    
    showToast('Failed to load performance data: ' + error.message, 'error');
  }
}

// Helper function to extract user ID from JWT token
function getUserIdFromToken() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (!token) return null;
  
  try {
    // Split the token and get the payload part
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Decode the payload - handle both browser and node environments
    let payload;
    try {
      // Browser environment
      payload = JSON.parse(atob(parts[1]));
    } catch (e) {
      // Fallback for non-browser environments or older browsers
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      payload = JSON.parse(jsonPayload);
    }
    
    // Different tokens might store the user ID under different keys
    const userId = payload.sub || payload.userId || payload.user_id || payload.id;
    
    console.log('Token payload:', { 
      userId, 
      exp: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'unknown'
    });
    
    return userId;
  } catch (error) {
    console.error('Error extracting user ID from token:', error);
    return null;
  }
}

// Helper to show loading indicators in all containers
function showLoadingIndicator() {
  document.querySelectorAll('.chart-container, .performance-summary, .class-performance, .recent-quizzes, .achievements-container')
    .forEach(container => {
      const existingLoader = container.querySelector('.elegant-loader');
      if (!existingLoader) {
        const loader = document.createElement('div');
        loader.className = 'elegant-loader';
        loader.innerHTML = `
          <div class="loader-ring">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
          <p>Loading your data...</p>
        `;
        
        // Clear container but maintain headers
        const header = container.querySelector('h3, .card-title');
        if (header) {
          container.innerHTML = '';
          container.appendChild(header);
        }
        
        container.appendChild(loader);
      }
    });
}

// Helper to hide loading indicators
function hideLoadingIndicator() {
  document.querySelectorAll('.elegant-loader').forEach(loader => {
    if (loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }
  });
}

// Add the displayPerformanceSummary function after the updatePerformanceSummary function

// Display performance summary cards
function displayPerformanceSummary(data) {
  // Alias to the existing updatePerformanceSummary function - for future compatibility
  updatePerformanceSummary(data);
}

// Display class performance cards
function displayClassPerformance(data) {
  // Find the container
  const container = document.querySelector('.class-performance');
  if (!container) {
    console.error('Class performance container not found');
    return;
  }
  
  // Clear the container
  container.innerHTML = '';
  
  // Check if we have classroom data
  if (!data.classrooms || data.classrooms.length === 0) {
    displayNoDataMessage(container, 'class-performance');
    return;
  }
  
  // Create a card for each classroom
  data.classrooms.forEach(classroom => {
    // Skip classrooms with no data
    if (!classroom) return;
    
    // Create the class card
    const card = document.createElement('div');
    card.className = 'class-card';
    
    // Get score class based on average score
    let scoreClass = '';
    if (classroom.averageScore >= 90) {
      scoreClass = 'score-excellent';
    } else if (classroom.averageScore >= 75) {
      scoreClass = 'score-good';
    } else if (classroom.averageScore >= 60) {
      scoreClass = 'score-fair';
    } else {
      scoreClass = 'score-poor';
    }
    
    // Calculate progress percentage
    const progressPercent = classroom.quizzesAttempted > 0 
      ? (classroom.quizzesAttempted / classroom.totalQuizzes) * 100 
      : 0;
    
    // Format classroom card content
    card.innerHTML = `
      <div class="class-card-header">
        <h4>${classroom.name || 'Unnamed Class'}</h4>
        <span class="score-badge ${scoreClass}">${classroom.averageScore.toFixed(1)}%</span>
      </div>
      
      <div class="class-stats">
        <div class="stats-item">
          <div class="stats-value">${classroom.totalQuizzes}</div>
          <div class="stats-label">Quizzes</div>
        </div>
        
        <div class="stats-item">
          <div class="stats-value">${classroom.quizzesAttempted}</div>
          <div class="stats-label">Completed</div>
        </div>
        
        <div class="stats-item">
          <div class="stats-value">${classroom.subject || 'General'}</div>
          <div class="stats-label">Subject</div>
        </div>
      </div>
      
      <div class="class-progress">
        <div class="progress-info">
          <span>Progress</span>
          <span>${classroom.quizzesAttempted}/${classroom.totalQuizzes} Quizzes</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%; background: linear-gradient(90deg, #4285F4, #34A853);"></div>
        </div>
      </div>
    `;
    
    // Add click handler to navigate to classroom details
    card.addEventListener('click', function() {
      window.location.href = `/student_classroom?id=${classroom.id}`;
    });
    
    // Add the card to the container
    container.appendChild(card);
  });
}

// Display performance insights based on trend analysis
function displayPerformanceInsights(container, quizScores, trendSlope) {
  // Find or create a container for insights
  let insightsContainer = container.querySelector('.performance-insights');
  if (!insightsContainer) {
    insightsContainer = document.createElement('div');
    insightsContainer.className = 'performance-insights';
    
    // Add it before the canvas
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.parentNode) {
      canvas.parentNode.insertBefore(insightsContainer, canvas);
    } else {
      container.appendChild(insightsContainer);
    }
  }
  
  // Calculate recent performance trend
  let trendClass = '';
  let trendIcon = '';
  let message = '';
  
  if (quizScores.length < 2) {
    // Not enough data for a trend
    message = 'Complete more quizzes to see performance insights.';
    trendClass = 'trend-neutral';
    trendIcon = 'info-circle';
  } else {
    // Determine trend direction
    if (trendSlope > 0.5) {
      message = 'Your performance is improving significantly. Keep up the good work!';
      trendClass = 'trend-improving';
      trendIcon = 'arrow-trend-up';
    } else if (trendSlope > 0.1) {
      message = 'Your performance is gradually improving. You\'re on the right track!';
      trendClass = 'trend-improving';
      trendIcon = 'arrow-up';
    } else if (trendSlope < -0.5) {
      message = 'Your performance has been declining. Consider reviewing challenging topics.';
      trendClass = 'trend-declining';
      trendIcon = 'arrow-trend-down';
    } else if (trendSlope < -0.1) {
      message = 'Your performance is slightly declining. Focus on areas that need improvement.';
      trendClass = 'trend-declining';
      trendIcon = 'arrow-down';
    } else {
      message = 'Your performance is stable and consistent.';
      trendClass = 'trend-stable';
      trendIcon = 'equals';
    }
    
    // Add average score information
    const avgScore = quizScores.reduce((a, b) => a + b, 0) / quizScores.length;
    
    if (avgScore >= 90) {
      message += ' You\'re achieving excellent scores!';
    } else if (avgScore >= 75) {
      message += ' You\'re performing well overall.';
    } else if (avgScore >= 60) {
      message += ' Your average score shows room for improvement.';
    } else {
      message += ' Focus on improving your overall scores.';
    }
  }
  
  // Update the insights container
  insightsContainer.className = `performance-insights ${trendClass}`;
  insightsContainer.innerHTML = `<i class="fas fa-${trendIcon}"></i> ${message}`;
}

// Utility function for handling API requests with retries
async function fetchWithRetry(url, options = {}, maxRetries = 2) {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return await response.json();
      } else {
        // Special handling for common error codes
        if (response.status === 404) {
          console.warn(`Resource not found at ${url}`);
          // Return empty data structure for 404s instead of throwing
          return { success: false, error: 'not_found', message: 'Resource not found', status: 404 };
        } else if (response.status === 401 || response.status === 403) {
          // Authentication issue - redirect to login
          showToast('Your session has expired. Please log in again.', 'error');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
          throw new Error(`Authentication error: ${response.status}`);
        } else if (response.status >= 500) {
          // Server error - maybe retry
          if (retries < maxRetries) {
            // Wait longer between each retry
            const waitTime = 1000 * Math.pow(2, retries);
            console.warn(`Server error (${response.status}). Retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retries++;
            continue;
          }
        }
        
        // For other errors, try to get error details from response
        let errorDetails;
        try {
          errorDetails = await response.json();
        } catch (e) {
          errorDetails = { message: response.statusText };
        }
        
        throw new Error(`API error ${response.status}: ${errorDetails.message || 'Unknown error'}`);
      }
    } catch (error) {
      // Network errors are retried
      if (error.name === 'TypeError' && retries < maxRetries) {
        const waitTime = 1000 * Math.pow(2, retries);
        console.warn(`Network error. Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retries++;
      } else {
        // Rethrow if it's not a network error or we've exceeded retries
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Generate sample data for testing purposes
function generateSampleData() {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  
  // Sample classrooms
  const classrooms = [
    {
      id: 'sample-class-1',
      name: 'Mathematics 101',
      subject: 'Mathematics',
      description: 'Introduction to basic mathematical concepts',
      totalQuizzes: 3,
      quizzesAttempted: 3,
      averageScore: 85
    },
    {
      id: 'sample-class-2',
      name: 'Physics Fundamentals',
      subject: 'Physics',
      description: 'Basic principles of physics',
      totalQuizzes: 2,
      quizzesAttempted: 2,
      averageScore: 78
    },
    {
      id: 'sample-class-3',
      name: 'Literature Studies',
      subject: 'Literature',
      description: 'Classic literature analysis',
      totalQuizzes: 2,
      quizzesAttempted: 1,
      averageScore: 92
    }
  ];
  
  // Sample quizzes
  const quizzes = [
    {
      id: 'sample-quiz-1',
      title: 'Algebra Basics',
      classroomId: 'sample-class-1',
      classroom: {
        id: 'sample-class-1',
        name: 'Mathematics 101',
        subject: 'Mathematics'
      },
      date: threeWeeksAgo,
      score: 80,
      maxScore: 100,
      percentage: 80,
      status: 'completed'
    },
    {
      id: 'sample-quiz-2',
      title: 'Geometry Concepts',
      classroomId: 'sample-class-1',
      classroom: {
        id: 'sample-class-1',
        name: 'Mathematics 101',
        subject: 'Mathematics'
      },
      date: twoWeeksAgo,
      score: 85,
      maxScore: 100,
      percentage: 85,
      status: 'completed'
    },
    {
      id: 'sample-quiz-3',
      title: 'Trigonometry Basics',
      classroomId: 'sample-class-1',
      classroom: {
        id: 'sample-class-1',
        name: 'Mathematics 101',
        subject: 'Mathematics'
      },
      date: oneWeekAgo,
      score: 90,
      maxScore: 100,
      percentage: 90,
      status: 'completed'
    },
    {
      id: 'sample-quiz-4',
      title: 'Newton\'s Laws',
      classroomId: 'sample-class-2',
      classroom: {
        id: 'sample-class-2',
        name: 'Physics Fundamentals',
        subject: 'Physics'
      },
      date: twoWeeksAgo,
      score: 75,
      maxScore: 100,
      percentage: 75,
      status: 'completed'
    },
    {
      id: 'sample-quiz-5',
      title: 'Energy Conservation',
      classroomId: 'sample-class-2',
      classroom: {
        id: 'sample-class-2',
        name: 'Physics Fundamentals',
        subject: 'Physics'
      },
      date: oneWeekAgo,
      score: 80,
      maxScore: 100,
      percentage: 80,
      status: 'completed'
    },
    {
      id: 'sample-quiz-6',
      title: 'Shakespeare Analysis',
      classroomId: 'sample-class-3',
      classroom: {
        id: 'sample-class-3',
        name: 'Literature Studies',
        subject: 'Literature'
      },
      date: oneWeekAgo,
      score: 92,
      maxScore: 100,
      percentage: 92,
      status: 'completed'
    }
  ];
  
  return { classrooms, quizzes };
}

// Helper function to get URL parameters
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}
