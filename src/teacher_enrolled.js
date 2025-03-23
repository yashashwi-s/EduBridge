document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  const profileWrapper = document.querySelector('.profile-wrapper');
  const profileDropdown = document.querySelector('.profile-dropdown');
  const studentSearch = document.getElementById('studentSearch');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const allStudentsList = document.getElementById('allStudentsList');
  const classroomsContainer = document.getElementById('classroomsContainer');
  const studentModal = document.getElementById('studentModal');
  const closeModal = document.querySelector('.modal .close');
  const totalStudentsSpan = document.getElementById('totalStudents');
  const totalStudentsCard = document.getElementById('totalStudentsCard');
  const totalClassesCard = document.getElementById('totalClassesCard');
  const mostActiveCard = document.getElementById('mostActiveCard');
  const topClassCard = document.getElementById('topClassCard');
  const classFilterOptions = document.getElementById('classFilterOptions');

  // State management
  let enrolledData = null;
  let currentStudentId = null;
  let currentFilter = 'all';
  let searchTerm = '';
  
  // Check authentication status
  function checkAuthStatus() {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('access_token');
    if (token) {
      console.log('User is authenticated with token');
      
      // For debugging: Add a small indicator in the UI
      const authStatus = document.createElement('div');
      authStatus.style.position = 'fixed';
      authStatus.style.top = '70px';
      authStatus.style.right = '10px';
      authStatus.style.padding = '5px 10px';
      authStatus.style.backgroundColor = '#4CAF50';
      authStatus.style.color = 'white';
      authStatus.style.borderRadius = '3px';
      authStatus.style.fontSize = '12px';
      authStatus.style.zIndex = '1000';
      authStatus.textContent = 'Authenticated';
      document.body.appendChild(authStatus);
      
      return true;
    } else {
      console.log('User is not authenticated');
      return false;
    }
  }
  
  // Call the authentication check
  const isAuthenticated = checkAuthStatus();

  // Toggle sidebar expansion
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
  });

  // Toggle profile dropdown
  profileWrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('show');
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', () => {
    profileDropdown.classList.remove('show');
  });

  // Tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Show the selected tab content
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });

  // Close modal
  closeModal.addEventListener('click', () => {
    studentModal.classList.remove('show');
  });

  // Close modal when clicking outside
  studentModal.addEventListener('click', (e) => {
    if (e.target === studentModal) {
      studentModal.classList.remove('show');
    }
  });

  // Search functionality
  studentSearch.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderStudents();
  });

  // Fetch enrolled students data
  async function fetchEnrolledStudents() {
    // Show initial loading state and hide content
    const initialLoading = document.getElementById('initial-loading');
    const overviewContainer = document.querySelector('.overview-container');
    const tabsContainer = document.querySelector('.tabs-container');
    
    // Make sure loading state is visible and content is hidden
    if (initialLoading) initialLoading.style.display = 'flex';
    if (overviewContainer) overviewContainer.style.display = 'none';
    if (tabsContainer) tabsContainer.style.display = 'none';
    
    try {
      // Try to use authentication if available - check both token name formats
      const token = localStorage.getItem('accessToken') || localStorage.getItem('access_token');
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Add authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('Using authentication token for request');
      } else {
        console.log('No authentication token found');
      }
      
      // Display fetching message in loading state
      if (initialLoading) {
        initialLoading.innerHTML = `
          <i class="fas fa-spinner fa-pulse"></i>
          <p>Fetching student data${token ? ' from database' : ''}...</p>
        `;
      }
      
      console.log('Fetching enrolled students data...');
      const response = await fetch('/api/enrolled-students', {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch enrolled students: ${response.status} ${response.statusText}`);
      }

      enrolledData = await response.json();
      
      // Check if we got valid data
      if (!enrolledData || !enrolledData.students || !enrolledData.classrooms) {
        console.error('Invalid data received:', enrolledData);
        throw new Error('Invalid data format received from the server');
      }
      
      // Check if we got sample data
      const isSampleData = enrolledData.isSampleData === true;
      console.log('Enrolled data received:', enrolledData, isSampleData ? '(sample data)' : '(real data)');
      
      // If this is sample data but we have a token, show a warning
      if (isSampleData && token) {
        console.warn('Using sample data despite having authentication token. Authentication may have failed on the server.');
        console.warn('Token details: Length:', token.length, 'First 10 chars:', token.substring(0, 10) + '...');
      }
      
      // Hide loading state and show content
      if (initialLoading) initialLoading.style.display = 'none';
      if (overviewContainer) overviewContainer.style.display = 'grid';
      if (tabsContainer) tabsContainer.style.display = 'block';
      
      // Show sample data notice if applicable
      if (isSampleData) {
        const noticeContainer = document.createElement('div');
        noticeContainer.className = 'sample-data-notice';
        noticeContainer.innerHTML = `
          <i class="fas fa-info-circle"></i>
          <p>Showing sample data. ${token ? 'Database connection issue or no real data available.' : 'Please log in to see your actual student data.'}</p>
        `;
        const dashboardContent = document.querySelector('.dashboard-content');
        dashboardContent.insertBefore(noticeContainer, dashboardContent.firstChild);
      }
      
      // Update UI with the data
      updateDashboardStats();
      renderStudents();
      renderClassrooms();
      populateFilterOptions();

    } catch (error) {
      console.error('Error fetching enrolled students:', error);
      
      // Hide loading state
      if (initialLoading) initialLoading.style.display = 'none';
      
      // Create error state UI instead of alert
      const contentArea = document.querySelector('.dashboard-content');
      if (contentArea) {
        contentArea.innerHTML = `
          <div class="error-state">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Couldn't load student data</h3>
            <p>${error.message || 'Please try again later'}</p>
            <button id="retryButton" class="retry-btn">Retry</button>
          </div>
        `;
        
        // Add retry button handler
        document.getElementById('retryButton')?.addEventListener('click', () => {
          contentArea.innerHTML = `
            <div class="loading-state">
              <i class="fas fa-spinner fa-pulse"></i>
              <p>Loading student data...</p>
            </div>
          `;
          setTimeout(() => fetchEnrolledStudents(), 500);
        });
      } else {
        // Fallback to alert if content area not found
        alert('Failed to load enrolled students. Please try again later.');
      }
    }
  }

  // Update dashboard statistics
  function updateDashboardStats() {
    if (!enrolledData) return;

    const totalStudents = enrolledData.totalStudents;
    const totalClasses = enrolledData.totalClassrooms;
    
    // Update student count
    totalStudentsSpan.textContent = totalStudents;
    totalStudentsCard.textContent = totalStudents;
    totalClassesCard.textContent = totalClasses;

    // Find most active student (in most classes)
    if (enrolledData.students.length > 0) {
      const mostActiveStudent = enrolledData.students[0]; // Already sorted by enrollment count
      mostActiveCard.textContent = mostActiveStudent.name;
    }

    // Find top class (most students)
    if (enrolledData.classrooms.length > 0) {
      const topClass = [...enrolledData.classrooms].sort((a, b) => 
        b.students.length - a.students.length
      )[0];
      
      topClassCard.textContent = topClass.name;
    }
  }

  // Populate filter options with classrooms
  function populateFilterOptions() {
    if (!enrolledData) return;

    classFilterOptions.innerHTML = '';
    
    enrolledData.classrooms.forEach(classroom => {
      const label = document.createElement('label');
      label.innerHTML = `
        <input type="checkbox" value="${classroom.id}" class="class-filter"> ${classroom.name}
      `;
      classFilterOptions.appendChild(label);
    });

    // Add event listeners to filter checkboxes
    document.querySelectorAll('.class-filter').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const allClassesCheckbox = document.querySelector('input[value="all"]');
        
        // If individual class is checked, uncheck "All Classes"
        if (checkbox.checked) {
          allClassesCheckbox.checked = false;
          currentFilter = 'custom';
        } else {
          // If no individual classes are checked, check "All Classes"
          const anyChecked = [...document.querySelectorAll('.class-filter')].some(cb => cb.checked);
          if (!anyChecked) {
            allClassesCheckbox.checked = true;
            currentFilter = 'all';
          }
        }
        
        renderStudents();
      });
    });

    // All classes checkbox logic
    const allClassesCheckbox = document.querySelector('input[value="all"]');
    allClassesCheckbox.addEventListener('change', () => {
      if (allClassesCheckbox.checked) {
        document.querySelectorAll('.class-filter').forEach(cb => {
          cb.checked = false;
        });
        currentFilter = 'all';
        renderStudents();
      }
    });
  }

  // Generate initial for student avatar
  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  // Format date to readable format
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  // Render the "All Students" tab
  function renderStudents() {
    if (!enrolledData) return;
    
    // Apply filters and search
    let filteredStudents = [...enrolledData.students];
    
    // Apply search filter
    if (searchTerm) {
      filteredStudents = filteredStudents.filter(student => 
        student.name.toLowerCase().includes(searchTerm) ||
        student.email.toLowerCase().includes(searchTerm) ||
        student.institution.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply class filter
    if (currentFilter === 'custom') {
      const selectedClassIds = [...document.querySelectorAll('.class-filter:checked')]
        .map(cb => cb.value);
      
      if (selectedClassIds.length > 0) {
        // Find all students in these classes
        const studentsByClass = new Set();
        enrolledData.classrooms.forEach(classroom => {
          if (selectedClassIds.includes(classroom.id)) {
            classroom.students.forEach(student => {
              studentsByClass.add(student.id);
            });
          }
        });
        
        filteredStudents = filteredStudents.filter(student => 
          studentsByClass.has(student.id)
        );
      }
    }
    
    // Clear current list
    allStudentsList.innerHTML = '';
    
    // Update count
    totalStudentsSpan.textContent = filteredStudents.length;
    
    // Render each student card
    filteredStudents.forEach(student => {
      // Count classes for this student
      const studentClassCount = enrolledData.classrooms.reduce((count, classroom) => {
        const isEnrolled = classroom.students.some(s => s.id === student.id);
        return isEnrolled ? count + 1 : count;
      }, 0);
      
      const studentCard = document.createElement('div');
      studentCard.className = 'student-card';
      studentCard.dataset.studentId = student.id;
      
      // Create avatar with initials
      const initials = getInitials(student.name);
      
      studentCard.innerHTML = `
        <div class="student-avatar" style="background-color: ${getAvatarColor(student.id)}">
          ${initials}
        </div>
        <div class="student-name">${student.name}</div>
        <div class="student-email">${student.email}</div>
        <div class="student-institution">${student.institution || 'Not specified'}</div>
        <div class="student-classes">${studentClassCount} class${studentClassCount !== 1 ? 'es' : ''}</div>
        <div class="student-joined">${formatDate(student.joinedAt)}</div>
        <div class="student-actions">
          <button class="action-btn view-btn" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      `;
      
      // Add click event to open student details
      studentCard.addEventListener('click', () => {
        openStudentModal(student);
      });
      
      allStudentsList.appendChild(studentCard);
    });
    
    // Show empty state if no students
    if (filteredStudents.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <i class="fas fa-user-graduate"></i>
        <p>No students found</p>
        ${searchTerm ? '<p>Try a different search term or clear the filters</p>' : ''}
      `;
      allStudentsList.appendChild(emptyState);
    }
  }

  // Generate a consistent color for avatars based on ID
  function getAvatarColor(id) {
    // Generate a deterministic color based on the user ID
    const colors = [
      '#e8f0fe', '#d2e3fc', '#a8c7fa', '#7baaf7', 
      '#e6f4ea', '#ceead6', '#a8dab5', '#81c995',
      '#fef7e0', '#feefc3', '#fee6aa', '#fed178'
    ];
    
    // Use the first few characters of the ID as a simple hash
    const hash = id.substring(0, 6).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
  }

  // Render the "By Class" tab
  function renderClassrooms() {
    if (!enrolledData) return;
    
    // Clear current list
    classroomsContainer.innerHTML = '';
    
    // Render each classroom
    enrolledData.classrooms.forEach(classroom => {
      const classCard = document.createElement('div');
      classCard.className = 'class-card';
      
      classCard.innerHTML = `
        <div class="class-header">
          <h3>${classroom.name}</h3>
          <span>${classroom.students.length} student${classroom.students.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="class-subheader">
          <div class="class-info">
            <i class="fas fa-book"></i>
            <span>${classroom.subject}</span>
          </div>
          <div class="class-info">
            <i class="fas fa-users"></i>
            <span>Section ${classroom.section}</span>
          </div>
        </div>
        <div class="class-students">
          <div class="class-students-header">
            <div></div>
            <div>Name</div>
            <div>Email</div>
            <div></div>
          </div>
          <div class="class-students-list" id="class-${classroom.id}-students">
            <!-- Student cards will be added here -->
          </div>
        </div>
      `;
      
      classroomsContainer.appendChild(classCard);
      
      // Add students to this classroom
      const studentsContainer = classCard.querySelector(`#class-${classroom.id}-students`);
      
      if (classroom.students.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
          <p>No students enrolled in this class yet</p>
        `;
        studentsContainer.appendChild(emptyState);
        return;
      }
      
      // Render each student in this classroom
      classroom.students.forEach(classStudent => {
        // Find full student details
        const fullStudent = enrolledData.students.find(s => s.id === classStudent.id);
        if (!fullStudent) return;
        
        const studentCard = document.createElement('div');
        studentCard.className = 'class-student-card';
        studentCard.dataset.studentId = classStudent.id;
        
        // Create avatar with initials
        const initials = getInitials(classStudent.name);
        
        studentCard.innerHTML = `
          <div class="student-avatar" style="background-color: ${getAvatarColor(classStudent.id)}">
            ${initials}
          </div>
          <div class="student-name">${classStudent.name}</div>
          <div class="student-email">${classStudent.email}</div>
          <div class="class-student-actions">
            <button class="action-btn view-btn" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        `;
        
        // Add click event to open student details
        studentCard.addEventListener('click', () => {
          openStudentModal(fullStudent);
        });
        
        studentsContainer.appendChild(studentCard);
      });
    });
  }

  // Open student details modal
  function openStudentModal(student) {
    if (!student) return;
    
    currentStudentId = student.id;
    
    // Helper to check if a field is a placeholder
    const isPlaceholder = (value) => {
      return typeof value === 'string' && value.includes('PLACEHOLDER');
    };
    
    // Set student details in modal
    document.getElementById('modalStudentName').textContent = student.name;
    document.getElementById('modalStudentEmail').textContent = student.email;
    
    // Handle institution data
    const institutionElement = document.getElementById('modalStudentInstitution');
    if (student.institution) {
      institutionElement.textContent = isPlaceholder(student.institution) 
        ? 'No institution data available' 
        : student.institution;
      
      if (isPlaceholder(student.institution)) {
        institutionElement.classList.add('placeholder-data');
      } else {
        institutionElement.classList.remove('placeholder-data');
      }
    } else {
      institutionElement.textContent = 'No institution specified';
      institutionElement.classList.add('placeholder-data');
    }
    
    // Set avatar
    const initials = getInitials(student.name);
    const avatarColor = getAvatarColor(student.id);
    const avatarElement = document.getElementById('modalStudentAvatar');
    avatarElement.style.display = 'none';
    
    // Create additional info section if it doesn't exist
    let additionalInfoSection = document.getElementById('modalStudentAdditionalInfo');
    if (!additionalInfoSection) {
      const studentProfile = document.querySelector('.student-profile');
      additionalInfoSection = document.createElement('div');
      additionalInfoSection.className = 'student-details-section';
      additionalInfoSection.id = 'modalStudentAdditionalInfo';
      additionalInfoSection.innerHTML = `
        <h4>Additional Information</h4>
        <div class="additional-info-grid">
          <div class="info-item">
            <label>Phone:</label>
            <p id="modalStudentPhone">Not provided</p>
          </div>
          <div class="info-item">
            <label>Department:</label>
            <p id="modalStudentDepartment">Not provided</p>
          </div>
          <div class="info-item">
            <label>Title:</label>
            <p id="modalStudentTitle">Not provided</p>
          </div>
          <div class="info-item">
            <label>Joined:</label>
            <p id="modalStudentJoined">Not provided</p>
          </div>
        </div>
        <div class="info-item bio-item">
          <label>Bio:</label>
          <p id="modalStudentBio">No bio provided</p>
        </div>
      `;
      
      // Insert it before the enrolled classes section
      const classesSection = document.querySelector('.student-details-section');
      if (classesSection) {
        studentProfile.insertBefore(additionalInfoSection, classesSection);
      } else {
        studentProfile.appendChild(additionalInfoSection);
      }
    }
    
    // Update additional info fields
    const setField = (id, value, defaultText = 'Not provided') => {
      const element = document.getElementById(id);
      if (!element) return;
      
      if (value) {
        element.textContent = isPlaceholder(value) ? defaultText : value;
        element.classList.toggle('placeholder-data', isPlaceholder(value));
      } else {
        element.textContent = defaultText;
        element.classList.add('placeholder-data');
      }
    };
    
    setField('modalStudentPhone', student.phone);
    setField('modalStudentDepartment', student.department);
    setField('modalStudentTitle', student.title);
    setField('modalStudentBio', student.bio, 'No bio provided');
    
    // Format and display join date
    const joinedElement = document.getElementById('modalStudentJoined');
    if (joinedElement) {
      if (student.joinedAt) {
        const joinDate = isPlaceholder(student.joinedAt) 
          ? new Date('2023-01-01') 
          : new Date(student.joinedAt);
          
        joinedElement.textContent = formatDate(joinDate);
        joinedElement.classList.toggle('placeholder-data', isPlaceholder(student.joinedAt));
      } else {
        joinedElement.textContent = 'Unknown';
        joinedElement.classList.add('placeholder-data');
      }
    }
    
    // Find the classes this student is enrolled in
    const enrolledClasses = enrolledData.classrooms.filter(classroom => 
      classroom.students.some(s => s.id === student.id)
    );
    
    // Update enrolled classes section
    const classesContainer = document.getElementById('modalStudentClasses');
    classesContainer.innerHTML = '';
    
    if (enrolledClasses.length === 0) {
      classesContainer.innerHTML = '<p>Not enrolled in any classes</p>';
    } else {
      enrolledClasses.forEach(classroom => {
        const classCard = document.createElement('div');
        classCard.className = 'modal-class-card';
        classCard.innerHTML = `
          <div class="modal-class-name">${classroom.name}</div>
          <div class="modal-class-detail">
            <i class="fas fa-book"></i>
            <span>${classroom.subject}</span>
          </div>
          <div class="modal-class-detail">
            <i class="fas fa-users"></i>
            <span>Section ${classroom.section}</span>
          </div>
        `;
        classesContainer.appendChild(classCard);
      });
    }
    
    // Set performance data (just placeholders for now)
    const quizCompletionElement = document.getElementById('modalQuizCompletion');
    const averageScoreElement = document.getElementById('modalAverageScore');
    const participationElement = document.getElementById('modalParticipation');
    
    // Check if we have actual performance data or using placeholders
    const isSampleData = enrolledData.isSampleData === true;
    if (isSampleData) {
      // Mark performance data as placeholders
      quizCompletionElement.textContent = 'No data';
      averageScoreElement.textContent = 'No data';
      participationElement.textContent = 'No data';
      
      quizCompletionElement.classList.add('placeholder-data');
      averageScoreElement.classList.add('placeholder-data');
      participationElement.classList.add('placeholder-data');
      
      // Add a note to the performance section
      const performanceSection = quizCompletionElement.closest('.student-details-section');
      
      if (performanceSection) {
        if (!performanceSection.querySelector('.placeholder-note')) {
          const note = document.createElement('p');
          note.className = 'placeholder-note';
          note.innerHTML = '<i class="fas fa-info-circle"></i> Performance data will be available with real student data.';
          performanceSection.appendChild(note);
        }
      }
    } else {
      // Use random values for demo (in a real app, we'd fetch this data from the API)
      quizCompletionElement.textContent = `${Math.floor(Math.random() * 100)}%`;
      averageScoreElement.textContent = `${Math.floor(70 + Math.random() * 30)}%`;
      participationElement.textContent = `${Math.floor(60 + Math.random() * 40)}%`;
      
      quizCompletionElement.classList.remove('placeholder-data');
      averageScoreElement.classList.remove('placeholder-data');
      participationElement.classList.remove('placeholder-data');
      
      // Remove any placeholder notes
      const note = document.querySelector('.placeholder-note');
      if (note) note.remove();
    }
    
    // Show the modal
    studentModal.classList.add('show');
  }

  // Handle contact buttons in modal (just for demonstration)
  document.querySelector('.email-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentStudentId) return;
    
    const student = enrolledData.students.find(s => s.id === currentStudentId);
    if (student) {
      window.location.href = `mailto:${student.email}`;
    }
  });
  
  document.querySelector('.message-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    alert('Messaging functionality will be available in a future update');
  });

  // Initialize the page
  fetchEnrolledStudents();
}); 