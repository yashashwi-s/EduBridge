/* Sidebar toggle functionality */
const hamburger = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
hamburger.addEventListener('click', () => {
  sidebar.classList.toggle('expanded');
});

/* Profile dropdown functionality */
const profileWrapper = document.querySelector('.profile-wrapper');
const profileDropdown = document.querySelector('.profile-dropdown');
profileWrapper.addEventListener('click', (e) => {
  e.stopPropagation();
  profileDropdown.classList.toggle('show');
});
document.addEventListener('click', () => {
  profileDropdown.classList.remove('show');
});

/* Tabs functionality */
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    tabContents.forEach((content) => content.classList.remove('active'));
    const tabId = tab.getAttribute('data-tab');
    document.getElementById(`${tabId}-tab`).classList.add('active');

    // Redraw charts on tab switch (if needed)
    if (tabId === 'overall' && performanceChart) {
      performanceChart.resize();
    } else if (tabId === 'trends' && trendsChart) {
      trendsChart.resize();
    }
  });
});

/* Modal functionality for Editing Profile */
const editProfileBtn = document.querySelector('.edit-profile-btn');
const profileModal = document.getElementById('profileModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.querySelector('.cancel-btn');
const profileForm = document.getElementById('profileForm');

function openModal() {
  if (profileModal) {
    profileModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Populate form fields with current profile data
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const institutionInput = document.getElementById('institution');
    const titleInput = document.getElementById('title');
    
    if (fullNameInput) fullNameInput.value = document.querySelector('.profile-name').textContent;
    if (titleInput) titleInput.value = document.querySelector('.profile-title').textContent;
    
    const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
    if (contactItems.length >= 3) {
      if (emailInput) emailInput.value = contactItems[0].textContent;
      if (phoneInput) phoneInput.value = contactItems[1].textContent;
      if (institutionInput) institutionInput.value = contactItems[2].textContent;
    }
  }
}

function closeModalFunc() {
  if (profileModal) {
    profileModal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

if (editProfileBtn) {
  editProfileBtn.addEventListener('click', openModal);
}

if (closeModal) {
  closeModal.addEventListener('click', closeModalFunc);
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', closeModalFunc);
}

window.addEventListener('click', (e) => {
  if (profileModal && e.target === profileModal) {
    closeModalFunc();
  }
});

// Handle form submission
if (profileForm) {
  profileForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = {
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      institution: document.getElementById('institution').value,
      title: document.getElementById('title').value,
    };
    
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Please log in.');
      window.location.href = '/login';
      return;
    }
    
    // Update UI immediately for better UX
    document.querySelector('.profile-name').textContent = formData.fullName;
    document.querySelector('.profile-title').textContent = formData.title;
    
    const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
    if (contactItems.length >= 3) {
      contactItems[0].textContent = formData.email;
      contactItems[1].textContent = formData.phone;
      contactItems[2].textContent = formData.institution;
    }
    
    // Send data to server
    fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to update profile');
      }
      return response.json();
    })
    .then(data => {
      // Close the modal
      closeModalFunc();
      
      // Show success message
      alert('Profile updated successfully!');
    })
    .catch(error => {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    });
  });
}

/* Fetch student quiz data and performance metrics */
function fetchStudentPerformanceData() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    console.error('No authentication token found');
    return;
  }

  // Show loading indicators
  document.querySelectorAll('.chart-container').forEach(container => {
    container.innerHTML = '<div class="loading-spinner"></div>';
  });

  // Fetch classrooms first to get IDs
  fetch('/api/classrooms', {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
  .then(response => response.json())
  .then(data => {
    if (!data.classrooms || data.classrooms.length === 0) {
      displayNoDataMessage();
      return;
    }
    
    // Process each classroom to get quiz data
    const classroomPromises = data.classrooms.map(classroom => 
      fetch(`/api/classrooms/${classroom._id}/quizzes/student`, {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      })
      .then(response => response.json())
      .then(quizData => {
        return {
          classroom: classroom,
          quizzes: quizData.quizzes || []
        };
      })
    );
    
    return Promise.all(classroomPromises);
  })
  .then(classroomsWithQuizzes => {
    if (!classroomsWithQuizzes) return;
    
    // Process and organize data for visualization
    const performanceData = processPerformanceData(classroomsWithQuizzes);
    
    // Create visualizations
    createOverallPerformanceChart(performanceData);
    createClasswisePerformanceChart(performanceData);
    createTrendsChart(performanceData);
    
    // Update achievement cards based on performance
    updateAchievements(performanceData);
  })
  .catch(error => {
    console.error('Error fetching performance data:', error);
    displayNoDataMessage();
  });
}

function processPerformanceData(classroomsWithQuizzes) {
  // Initialize data structure
  const performanceData = {
    classrooms: [],
    quizzesByClass: {},
    quizzesByMonth: {},
    quizzesByType: {},
    quizzesByDifficulty: {},
    overallStats: {
      totalQuizzes: 0,
      completedQuizzes: 0,
      totalScore: 0,
      totalMaxScore: 0,
      averagePercentage: 0,
      highestScore: 0,
      lowestScore: 100,
      subjectiveAverage: 0,
      objectiveAverage: 0
    }
  };
  
  // Process each classroom and its quizzes
  classroomsWithQuizzes.forEach(item => {
    const classroom = item.classroom;
    const quizzes = item.quizzes;
    
    // Add classroom to the list
    performanceData.classrooms.push({
      id: classroom._id,
      name: classroom.className,
      subject: classroom.subject,
      quizCount: quizzes.length,
      completed: quizzes.filter(q => q.status === 'submitted' || q.status === 'graded').length
    });
    
    // Initialize classroom quiz data
    performanceData.quizzesByClass[classroom._id] = {
      className: classroom.className,
      subject: classroom.subject,
      totalQuizzes: quizzes.length,
      completedQuizzes: 0,
      totalScore: 0,
      totalMaxScore: 0,
      averagePercentage: 0,
      quizzes: []
    };
    
    // Process each quiz
    quizzes.forEach(quiz => {
      // Skip quizzes that haven't been submitted/graded
      if (quiz.status !== 'submitted' && quiz.status !== 'graded') return;
      
      const quizScore = quiz.score || 0;
      const quizMaxScore = quiz.maxScore || 1;
      const quizPercentage = (quizScore / quizMaxScore) * 100;
      const quizDate = new Date(quiz.submittedAt || quiz.startTime || quiz.createdAt);
      const monthYear = `${quizDate.getMonth() + 1}/${quizDate.getFullYear()}`;
      const quizType = quiz.quizType || 'standard';
      const quizDifficulty = determineDifficulty(quiz);
      
      // Update classroom-specific data
      const classData = performanceData.quizzesByClass[classroom._id];
      classData.completedQuizzes++;
      classData.totalScore += quizScore;
      classData.totalMaxScore += quizMaxScore;
      classData.quizzes.push({
        id: quiz.id,
        title: quiz.title,
        score: quizScore,
        maxScore: quizMaxScore,
        percentage: quizPercentage,
        date: quizDate,
        type: quizType,
        difficulty: quizDifficulty
      });
      
      // Update overall stats
      performanceData.overallStats.totalQuizzes++;
      performanceData.overallStats.completedQuizzes++;
      performanceData.overallStats.totalScore += quizScore;
      performanceData.overallStats.totalMaxScore += quizMaxScore;
      performanceData.overallStats.highestScore = Math.max(performanceData.overallStats.highestScore, quizPercentage);
      performanceData.overallStats.lowestScore = Math.min(performanceData.overallStats.lowestScore, quizPercentage);
      
      // Organize by month
      if (!performanceData.quizzesByMonth[monthYear]) {
        performanceData.quizzesByMonth[monthYear] = {
          totalScore: 0,
          totalMaxScore: 0,
          count: 0
        };
      }
      performanceData.quizzesByMonth[monthYear].totalScore += quizScore;
      performanceData.quizzesByMonth[monthYear].totalMaxScore += quizMaxScore;
      performanceData.quizzesByMonth[monthYear].count++;
      
      // Organize by quiz type
      if (!performanceData.quizzesByType[quizType]) {
        performanceData.quizzesByType[quizType] = {
          totalScore: 0,
          totalMaxScore: 0,
          count: 0
        };
      }
      performanceData.quizzesByType[quizType].totalScore += quizScore;
      performanceData.quizzesByType[quizType].totalMaxScore += quizMaxScore;
      performanceData.quizzesByType[quizType].count++;
      
      // Organize by difficulty
      if (!performanceData.quizzesByDifficulty[quizDifficulty]) {
        performanceData.quizzesByDifficulty[quizDifficulty] = {
          totalScore: 0,
          totalMaxScore: 0,
          count: 0
        };
      }
      performanceData.quizzesByDifficulty[quizDifficulty].totalScore += quizScore;
      performanceData.quizzesByDifficulty[quizDifficulty].totalMaxScore += quizMaxScore;
      performanceData.quizzesByDifficulty[quizDifficulty].count++;
    });
    
    // Calculate classroom averages
    const classData = performanceData.quizzesByClass[classroom._id];
    if (classData.totalMaxScore > 0) {
      classData.averagePercentage = (classData.totalScore / classData.totalMaxScore) * 100;
    }
  });
  
  // Calculate overall average
  if (performanceData.overallStats.totalMaxScore > 0) {
    performanceData.overallStats.averagePercentage = 
      (performanceData.overallStats.totalScore / performanceData.overallStats.totalMaxScore) * 100;
  }
  
  return performanceData;
}

function determineDifficulty(quiz) {
  // Determine difficulty based on various factors
  if (quiz.difficulty) return quiz.difficulty;
  
  // If no explicit difficulty, estimate based on score distribution
  if (quiz.classAverage) {
    if (quiz.classAverage < 60) return 'Hard';
    if (quiz.classAverage < 80) return 'Medium';
    return 'Easy';
  }
  
  // Default to medium if no information available
  return 'Medium';
}

function createOverallPerformanceChart(data) {
  const ctx = document.getElementById('performanceChart').getContext('2d');
  
  // If no data, show message
  if (data.overallStats.totalQuizzes === 0) {
    displayNoDataMessage();
    return;
  }
  
  // Create data for the radar chart
  const categories = [];
  const scores = [];
  
  // By type
  Object.entries(data.quizzesByType).forEach(([type, stats]) => {
    categories.push(formatType(type));
    scores.push((stats.totalScore / stats.totalMaxScore) * 100);
  });
  
  // By difficulty
  Object.entries(data.quizzesByDifficulty).forEach(([difficulty, stats]) => {
    categories.push(difficulty);
    scores.push((stats.totalScore / stats.totalMaxScore) * 100);
  });
  
  // Create chart
  new Chart(ctx, {
    type: 'radar',
  data: {
      labels: categories,
      datasets: [{
        label: 'Performance Score (%)',
        data: scores,
        backgroundColor: 'rgba(66, 133, 244, 0.2)',
        borderColor: 'rgba(66, 133, 244, 0.8)',
        pointBackgroundColor: 'rgba(66, 133, 244, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(66, 133, 244, 1)',
        borderWidth: 2
      }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
          position: 'top',
        },
      tooltip: {
          callbacks: {
            label: function(context) {
              return `Score: ${context.raw.toFixed(1)}%`;
            }
          }
        }
    },
    scales: {
        r: {
          angleLines: {
            display: true
          },
          suggestedMin: 0,
          suggestedMax: 100
        }
      }
    }
  });
  
  // Add summary statistics
  const performanceOverview = document.querySelector('#overall-tab');
  const statsHtml = `
    <div class="performance-stats">
      <div class="stat-item">
        <div class="stat-value">${data.overallStats.averagePercentage.toFixed(1)}%</div>
        <div class="stat-label">Average Score</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${data.overallStats.highestScore.toFixed(1)}%</div>
        <div class="stat-label">Highest Score</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${data.overallStats.completedQuizzes}</div>
        <div class="stat-label">Completed Quizzes</div>
      </div>
    </div>
  `;
  
  // Append stats after the chart
  const chartContainer = performanceOverview.querySelector('.chart-container');
  chartContainer.insertAdjacentHTML('afterend', statsHtml);
}

function createClasswisePerformanceChart(data) {
  const ctx = document.getElementById('classes-tab').querySelector('.class-performance');
  
  // If no data, show message
  if (data.classrooms.length === 0) {
    ctx.innerHTML = '<div class="no-data">No class data available</div>';
    return;
  }
  
  // Clear existing content
  ctx.innerHTML = '';
  
  // Create class cards with performance data
  Object.values(data.quizzesByClass).forEach(classData => {
    if (classData.completedQuizzes === 0) return;
    
    const averagePercentage = classData.averagePercentage;
    const grade = getGradeFromPercentage(averagePercentage);
    const completionPercentage = (classData.completedQuizzes / classData.totalQuizzes) * 100;
    
    const classCardHtml = `
      <div class="class-card">
        <div class="class-card-header">
          <div class="class-card-title">${classData.className}</div>
          <div class="class-card-grade">${grade}</div>
        </div>
        <div class="class-card-details">
          <i class="fas fa-book"></i> ${classData.subject}
        </div>
        <div class="class-card-details">
          <i class="fas fa-chart-bar"></i> Current Score: ${averagePercentage.toFixed(1)}%
        </div>
        <div class="class-progress-container">
          <div class="progress-label">Quizzes Completed: ${classData.completedQuizzes}/${classData.totalQuizzes}</div>
          <div class="class-progress-bar">
            <div class="class-progress-fill" style="width: ${completionPercentage}%"></div>
          </div>
        </div>
        <div class="quiz-list-toggle" data-classroom-id="${classData.className}">
          <i class="fas fa-chevron-down"></i> Show Quizzes
        </div>
        <div class="quiz-list" id="quiz-list-${classData.className}" style="display: none;">
          <table class="quiz-table">
            <thead>
              <tr>
                <th>Quiz</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${classData.quizzes.map(quiz => `
                <tr>
                  <td>${quiz.title}</td>
                  <td>${quiz.percentage.toFixed(1)}%</td>
                  <td>${formatDate(quiz.date)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    ctx.insertAdjacentHTML('beforeend', classCardHtml);
  });
  
  // Add toggle functionality for quiz lists
  document.querySelectorAll('.quiz-list-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const classroomId = toggle.getAttribute('data-classroom-id');
      const quizList = document.getElementById(`quiz-list-${classroomId}`);
      const isExpanded = quizList.style.display !== 'none';
      
      quizList.style.display = isExpanded ? 'none' : 'block';
      toggle.innerHTML = isExpanded ? 
        '<i class="fas fa-chevron-down"></i> Show Quizzes' : 
        '<i class="fas fa-chevron-up"></i> Hide Quizzes';
    });
  });
}

function createTrendsChart(data) {
  const ctx = document.getElementById('trendsChart').getContext('2d');
  
  // If no data, show message
  if (Object.keys(data.quizzesByMonth).length === 0) {
    displayNoDataMessage();
    return;
  }
  
  // Prepare data for line chart
  const months = Object.keys(data.quizzesByMonth).sort((a, b) => {
    const [aMonth, aYear] = a.split('/').map(Number);
    const [bMonth, bYear] = b.split('/').map(Number);
    return (aYear - bYear) || (aMonth - bMonth);
  });
  
  const percentages = months.map(month => {
    const monthData = data.quizzesByMonth[month];
    return (monthData.totalScore / monthData.totalMaxScore) * 100;
  });
  
  // Format labels to show month names
  const formattedLabels = months.map(month => {
    const [monthNum, year] = month.split('/');
    return `${getMonthName(parseInt(monthNum))} ${year}`;
  });
  
  // Create trend line
  new Chart(ctx, {
  type: 'line',
  data: {
      labels: formattedLabels,
      datasets: [{
        label: 'Monthly Performance (%)',
        data: percentages,
        borderColor: '#4285F4',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        fill: true,
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
          callbacks: {
            label: function(context) {
              const monthIndex = context.dataIndex;
              const month = months[monthIndex];
              const monthData = data.quizzesByMonth[month];
              return [
                `Score: ${context.raw.toFixed(1)}%`,
                `Quizzes: ${monthData.count}`
              ];
            }
          }
        },
    },
    scales: {
        y: {
          beginAtZero: false,
          min: Math.max(0, Math.min(...percentages) - 10),
          max: Math.min(100, Math.max(...percentages) + 10),
          title: {
            display: true,
            text: 'Score (%)'
          }
        },
        x: {
          grid: { display: false },
          title: {
            display: true,
            text: 'Month'
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
  
  // Add trend analysis if we have enough data points
  if (percentages.length >= 3) {
    const trendAnalysis = analyzeTrend(percentages);
    const trendsTab = document.getElementById('trends-tab');
    const analysisHtml = `
      <div class="trend-analysis">
        <h4>Performance Trend</h4>
        <p>${trendAnalysis.message}</p>
        <div class="trend-indicator ${trendAnalysis.trend}">
          <i class="fas fa-${trendAnalysis.icon}"></i> ${trendAnalysis.label}
        </div>
      </div>
    `;
    
    // Append analysis after the chart
    const chartContainer = trendsTab.querySelector('.chart-container');
    chartContainer.insertAdjacentHTML('afterend', analysisHtml);
  }
}

function updateAchievements(data) {
  // Get achievements section
  const achievementsSection = document.querySelector('.info-card:nth-child(2) .class-performance');
  
  // If no data, don't update achievements
  if (data.overallStats.totalQuizzes === 0) return;
  
  // Generate achievements based on performance data
  const achievements = [];
  
  // High performance achievement
  if (data.overallStats.averagePercentage >= 90) {
    achievements.push({
      title: 'Excellence Award',
      icon: '<i class="fas fa-medal" style="color: gold;"></i>',
      date: getCurrentDate(),
      description: 'Maintained an average score of 90% or higher'
    });
  } else if (data.overallStats.averagePercentage >= 80) {
    achievements.push({
      title: 'High Achiever',
      icon: '<i class="fas fa-medal" style="color: silver;"></i>',
      date: getCurrentDate(),
      description: 'Maintained an average score of 80% or higher'
    });
  }
  
  // Improvement achievement
  if (percentages && percentages.length >= 3) {
    const trend = analyzeTrend(percentages);
    if (trend.trend === 'improving') {
      achievements.push({
        title: 'Steady Improver',
        icon: '<i class="fas fa-chart-line" style="color: #34A853;"></i>',
        date: getCurrentDate(),
        description: 'Showing consistent improvement in quiz performance'
      });
    }
  }
  
  // Quiz completion achievement
  if (data.overallStats.completedQuizzes >= 10) {
    achievements.push({
      title: 'Quiz Master',
      icon: '<i class="fas fa-trophy" style="color: #FBBC05;"></i>',
      date: getCurrentDate(),
      description: 'Completed 10 or more quizzes'
    });
  }
  
  // Consistency achievement
  const classConsistency = Object.values(data.quizzesByClass).some(classData => {
    if (classData.quizzes.length < 3) return false;
    
    // Check if all scores are above 75%
    return classData.quizzes.every(quiz => quiz.percentage >= 75);
  });
  
  if (classConsistency) {
    achievements.push({
      title: 'Consistency Champion',
      icon: '<i class="fas fa-thumbs-up" style="color: #4285F4;"></i>',
      date: getCurrentDate(),
      description: 'Maintained scores above 75% in all quizzes for a class'
    });
  }
  
  // Display achievements
  achievementsSection.innerHTML = '';
  
  if (achievements.length === 0) {
    achievements.push({
      title: 'Keep Going!',
      icon: '<i class="fas fa-running" style="color: #4285F4;"></i>',
      date: getCurrentDate(),
      description: 'Complete more quizzes to earn achievements'
    });
  }
  
  achievements.forEach(achievement => {
    const achievementHtml = `
      <div class="class-card">
        <div class="class-card-header">
          <div class="class-card-title">${achievement.title}</div>
          <div>${achievement.icon}</div>
        </div>
        <div class="class-card-details">
          <i class="fas fa-calendar-check"></i> Achieved: ${achievement.date}
        </div>
        <div class="class-card-details">
          <i class="fas fa-info-circle"></i> ${achievement.description}
        </div>
      </div>
    `;
    
    achievementsSection.insertAdjacentHTML('beforeend', achievementHtml);
  });
}

// Utility functions
function getGradeFromPercentage(percentage) {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

function getMonthName(month) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1];
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatType(type) {
  // Format quiz type for display
  if (type === 'standard' || type === 'question') return 'Multiple Choice';
  if (type === 'pdf') return 'PDF/Written';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function analyzeTrend(percentages) {
  if (percentages.length < 3) {
    return {
      trend: 'neutral',
      label: 'Not enough data',
      icon: 'info-circle',
      message: 'Complete more quizzes to see your performance trend.'
    };
  }
  
  // Simple trend analysis
  const lastThree = percentages.slice(-3);
  const increasing = lastThree[0] < lastThree[1] && lastThree[1] < lastThree[2];
  const decreasing = lastThree[0] > lastThree[1] && lastThree[1] > lastThree[2];
  const stable = Math.abs(lastThree[0] - lastThree[2]) < 5;
  
  if (increasing) {
    return {
      trend: 'improving',
      label: 'Improving',
      icon: 'arrow-up',
      message: 'Your performance is trending upward. Keep up the good work!'
    };
  } else if (decreasing) {
    return {
      trend: 'declining',
      label: 'Declining',
      icon: 'arrow-down',
      message: 'Your performance has been declining. Consider reviewing material or seeking help.'
    };
  } else if (stable) {
    return {
      trend: 'stable',
      label: 'Stable',
      icon: 'equals',
      message: 'Your performance has been consistent. Focus on areas where you can improve.'
    };
  } else {
    return {
      trend: 'fluctuating',
      label: 'Fluctuating',
      icon: 'exchange-alt',
      message: 'Your performance has been fluctuating. Try to maintain consistency in your studies.'
    };
  }
}

function getCurrentDate() {
  const date = new Date();
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function displayNoDataMessage() {
  const chartContainers = document.querySelectorAll('.chart-container');
  chartContainers.forEach(container => {
    container.innerHTML = '<div class="no-data">No quiz data available yet</div>';
  });
}

// Initialize charts when page loads
document.addEventListener('DOMContentLoaded', function() {
  fetchStudentPerformanceData();
});

/* Performance Chart using Chart.js */
// ... existing code will be replaced by the more comprehensive charts above ...

/* Trends Chart using Chart.js */
// ... existing code will be replaced by the more comprehensive charts above ...
