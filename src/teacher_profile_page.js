// Sidebar toggle functionality
const hamburger = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
if (hamburger && sidebar) {
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
  });
}

// Profile dropdown functionality
const profileWrapper = document.querySelector('.profile-wrapper');
const profileDropdown = document.querySelector('.profile-dropdown');
if (profileWrapper && profileDropdown) {
  profileWrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    profileDropdown.classList.remove('show');
  });
}

// Date utility functions
function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  
  // Check if it's already in yyyy-mm-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Try to parse dd/mm/yyyy format
  const parts = dateStr.split(/[/.-]/);
  if (parts.length === 3) {
    // Check if first part is likely a day (1-31)
    if (parseInt(parts[0]) >= 1 && parseInt(parts[0]) <= 31) {
      // Assume dd/mm/yyyy format
      return `${parts[2].padStart(4, '20')}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    } else {
      // Try to guess the format
      return `${parts[0].padStart(4, '20')}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  
  return '';
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // Return original if not valid
    }
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateStr;
  }
}

// Modal functionality for Editing Profile
const editProfileBtn = document.getElementById('editProfileBtn');
const profileModal = document.getElementById('profileModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.querySelector('.cancel-btn');

// Store the user data globally for access across functions
let currentUserData = null;

function openModal() {
  if (profileModal) {
    profileModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Update form fields with current profile data
    const user = currentUserData;
    if (user) {
      // Personal Information
      document.getElementById('fullName').value = user.fullName || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('phone').value = user.phone || '';
      document.getElementById('dob').value = formatDateForInput(user.dob || '');
      document.getElementById('employeeId').value = user.employeeId || '';
      document.getElementById('joiningDate').value = formatDateForInput(user.joiningDate || '');
      document.getElementById('location').value = user.location || '';
      
      // Educational Qualifications
      document.getElementById('degree').value = user.degree || '';
      document.getElementById('university').value = user.university || '';
      document.getElementById('bachelors').value = user.bachelors || '';
      document.getElementById('certifications').value = user.certifications || '';
      
      // Teaching Information
      document.getElementById('institution').value = user.institution || '';
      document.getElementById('department').value = user.department || '';
      document.getElementById('title').value = user.title || '';
      // document.getElementById('classesTaught').value = user.classesTaught || '';
      document.getElementById('schedule').value = user.schedule || '';
      document.getElementById('officeHours').value = user.officeHours || '';
      
      // Skills
      document.getElementById('skills').value = user.skills ? user.skills.join(', ') : '';
      
      // Bio
      document.getElementById('bio').value = user.bio || '';
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

// Function to update UI with user profile data
// Update UI with user profile data
function updateProfileUI(user) {
  // Update sidebar profile info
  document.querySelector('.profile-name').textContent = user.fullName || '';
  document.querySelector('.profile-title').textContent = user.title || '';
  
  // Update contact information
  const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
  if (contactItems.length >= 4) {
    contactItems[0].textContent = user.email || '';
    contactItems[1].textContent = user.phone || '';
    contactItems[2].textContent = user.institution || '';
    contactItems[3].textContent = user.location || '';
  }
  
  // Update personal information section
  const infoValues = document.querySelectorAll('.info-card:nth-child(1) .info-value');
  if (infoValues.length >= 4) {
    infoValues[0].textContent = user.fullName || '';
    infoValues[1].textContent = user.dob ? formatDateForDisplay(user.dob) : '';
    infoValues[2].textContent = user.employeeId || '';
    infoValues[3].textContent = user.joiningDate ? formatDateForDisplay(user.joiningDate) : '';
  }
  
  // Update education section
  const eduValues = document.querySelectorAll('.info-card:nth-child(2) .info-value');
  if (eduValues.length >= 4) {
    eduValues[0].textContent = user.degree || '';
    eduValues[1].textContent = user.university || '';
    eduValues[2].textContent = user.bachelors || '';
    eduValues[3].textContent = user.certifications || '';
  }
  
  // Update teaching information
  const teachingValues = document.querySelectorAll('.info-card:nth-child(3) .info-value');
  if (teachingValues.length >= 4) {
    teachingValues[0].textContent = user.department || '';
    // fetch the classrooms the teacher is teaching from the API
    fetch('/api/classrooms', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('access_token')
      }
    })
    .then(response => response.json())
    .then(classrooms => {
      // Assuming the API returns only the classrooms for the current teacher,
      // map over the array to extract the classroom names
      let classNames = classrooms.map(c => c.className);
      teachingValues[1].textContent = classNames.join(', ') || 'N/A';
    })
    .catch(err => {
      console.error('Error fetching classrooms:', err);
      teachingValues[1].textContent = user.classesTaught || 'N/A';
    });
    
    teachingValues[2].textContent = user.schedule || '';
    teachingValues[3].textContent = user.officeHours || '';
  }
  
  // Update skills (if available)
  if (user.skills && Array.isArray(user.skills) && user.skills.length > 0) {
    const skillTags = document.querySelector('.skill-tags');
    if (skillTags) {
      skillTags.innerHTML = '';
      user.skills.forEach(skill => {
        const span = document.createElement('span');
        span.className = 'skill-tag';
        span.textContent = skill;
        skillTags.appendChild(span);
      });
    }
  }
  
  // Update bio
  const bioElement = document.querySelector('.info-card:nth-child(6) p');
  if (bioElement) {
    bioElement.textContent = user.bio || '';
  }
}

// On DOM load, fetch teacher profile data from API and display it
document.addEventListener('DOMContentLoaded', function() {
  // Initialize date inputs with max date to prevent future dates for DOB
  const dobInput = document.getElementById('dob');
  if (dobInput) {
    const today = new Date();
    dobInput.max = today.toISOString().split('T')[0];
  }
  
  // Add input validation for phone number
  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', function(e) {
      // Allow only numbers, parentheses, dashes and spaces
      this.value = this.value.replace(/[^\d()-\s]/g, '');
    });
  }
  
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Please log in.');
    window.location.href = '/login';
    return;
  }
  
  fetch('/api/profile', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to fetch profile data');
    }
    return response.json();
  })
  .then(user => {
    // Store user data globally
    currentUserData = user;
    
    // Update UI with user data
    updateProfileUI(user);
  })
  .catch(err => {
    console.error('Error fetching profile data:', err);
    alert('Failed to load profile data. Please try again later.');
  });
});

// Handle Edit Profile form submission using API
const profileForm = document.getElementById('profileForm');
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!profileForm.checkValidity()) {
      profileForm.reportValidity();
      return;
    }
    
    // Get form data
    const formData = {
      // Personal Information
      fullName: document.getElementById('fullName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      dob: document.getElementById('dob').value, // Already in yyyy-mm-dd format from input
      employeeId: document.getElementById('employeeId').value.trim(),
      joiningDate: document.getElementById('joiningDate').value, // Already in yyyy-mm-dd format from input
      location: document.getElementById('location').value.trim(),
      
      // Educational Qualifications
      degree: document.getElementById('degree').value.trim(),
      university: document.getElementById('university').value.trim(),
      bachelors: document.getElementById('bachelors').value.trim(),
      certifications: document.getElementById('certifications').value.trim(),
      
      // Teaching Information
      institution: document.getElementById('institution').value.trim(),
      department: document.getElementById('department').value.trim(),
      title: document.getElementById('title').value.trim(),
      schedule: document.getElementById('schedule').value.trim(),
      officeHours: document.getElementById('officeHours').value.trim(),
      
      // Skills - convert comma-separated string to array
      skills: document.getElementById('skills').value
        .split(',')
        .map(skill => skill.trim())
        .filter(skill => skill), // Filter out empty strings
      
      // Bio
      bio: document.getElementById('bio').value.trim(),
      
      // Authentication
      current_password: document.getElementById('currentPassword').value
    };
    
    // Validate required fields
    if (!formData.fullName || !formData.email || !formData.current_password) {
      alert('Name, email, and current password are required.');
      return;
    }
    
    // Show loading indicator
    const submitButton = profileForm.querySelector('.submit-btn');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Saving...';
    submitButton.disabled = true;
    
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Please log in.');
        return;
      }
      
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          dob: formData.dob,
          employeeId: formData.employeeId,
          joiningDate: formData.joiningDate,
          location: formData.location,
          degree: formData.degree,
          university: formData.university,
          bachelors: formData.bachelors,
          certifications: formData.certifications,
          institution: formData.institution,
          department: formData.department,
          title: formData.title,
          schedule: formData.schedule,
          officeHours: formData.officeHours,
          skills: formData.skills,
          bio: formData.bio,
          current_password: formData.current_password
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Update the stored user data
        currentUserData = {
          ...currentUserData,
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          dob: formData.dob,
          employeeId: formData.employeeId,
          joiningDate: formData.joiningDate,
          location: formData.location,
          degree: formData.degree,
          university: formData.university,
          bachelors: formData.bachelors,
          certifications: formData.certifications,
          institution: formData.institution,
          department: formData.department,
          title: formData.title,
          schedule: formData.schedule,
          officeHours: formData.officeHours,
          skills: formData.skills,
          bio: formData.bio
        };
        
        // Update the UI
        updateProfileUI(currentUserData);
        
        // Close the modal
        closeModalFunc();
        
        // Show success message
        alert('Profile updated successfully!');
      } else {
        // Show error message
        alert(`Failed to update profile: ${data.msg || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('An error occurred while updating your profile.');
    } finally {
      // Reset button state
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    }
  });
}
