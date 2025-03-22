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

/* Performance Chart using Chart.js */
const ctxPerformance = document.getElementById('performanceChart').getContext('2d');
const performanceChart = new Chart(ctxPerformance, {
  type: 'line',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Overall Rating',
        data: [1200, 1250, 1300, 1280, 1350, 1380],
        borderColor: '#1a73e8',
        backgroundColor: 'rgba(26, 115, 232, 0.1)',
        fill: true,
        tension: 0.3,
        borderWidth: 3,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1a73e8',
        bodyColor: '#3c4043',
        borderColor: '#e0e0e0',
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
      },
      x: { grid: { display: false } },
    },
  },
});

/* Trends Chart using Chart.js */
const ctxTrends = document.getElementById('trendsChart').getContext('2d');
const trendsChart = new Chart(ctxTrends, {
  type: 'line',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Physics 101',
        data: [85, 88, 84, 91, 92, 95],
        borderColor: '#4285F4',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: 'Calculus II',
        data: [78, 82, 85, 83, 88, 89],
        borderColor: '#34A853',
        backgroundColor: 'rgba(52, 168, 83, 0.1)',
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: 'Computer Science 101',
        data: [90, 88, 92, 94, 95, 98],
        borderColor: '#EA4335',
        backgroundColor: 'rgba(234, 67, 53, 0.1)',
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255,255,255,0.9)',
        titleColor: '#EA4335',
        bodyColor: '#3c4043',
        borderColor: '#e0e0e0',
        borderWidth: 1,
      },
    },
    scales: {
      y: { beginAtZero: false, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
      x: { grid: { display: false } },
    },
  },
});

/* Fetch student profile data from API */
document.addEventListener('DOMContentLoaded', function () {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Please log in.');
    window.location.href = '/login';
    return;
  }
  fetch('/api/profile', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  })
    .then((res) => res.json())
    .then((user) => {
      document.querySelector('.profile-name').textContent = user.fullName;
      document.querySelector('.profile-title').textContent = user.title || 'Student';
      const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
      if (contactItems.length >= 3) {
        contactItems[0].textContent = user.email;
        contactItems[1].textContent = user.phone || 'N/A';
        contactItems[2].textContent = user.institution || 'N/A';
      }
    })
    .catch((err) => console.error(err));
});
