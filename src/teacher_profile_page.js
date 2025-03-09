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

// Modal functionality for Editing Profile
const editProfileBtn = document.getElementById('editProfileBtn');
const profileModal = document.getElementById('profileModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.querySelector('.cancel-btn');

function openModal() {
  if (profileModal) {
    profileModal.classList.add('show');
    document.body.style.overflow = 'hidden';
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

// On DOM load, fetch teacher profile data from API and display it
document.addEventListener('DOMContentLoaded', function() {
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
  .then(response => response.json())
  .then(user => {
    // Display user info in the profile sidebar and main section
    document.querySelector('.profile-name').textContent = user.fullName;
    document.querySelector('.profile-title').textContent = user.title || '';
    const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
    if (contactItems.length >= 3) {
      contactItems[0].textContent = user.email;
      contactItems[1].textContent = user.phone;
      contactItems[2].textContent = user.institution;
    }
    // Optionally update additional sections like bio, department, etc.
    const bioElem = document.querySelector('.profile-main .bio p');
    if (bioElem) {
      bioElem.textContent = user.bio || '';
    }
  })
  .catch(err => console.error(err));
});

// Handle Edit Profile form submission using API
const profileForm = document.getElementById('profileForm');
if (profileForm) {
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const institution = document.getElementById('institution').value;
    const department = document.getElementById('department').value;
    const title = document.getElementById('title').value;
    const bio = document.getElementById('bio').value;
  
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Please log in.');
      return;
    }
    fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        fullName, email, phone, institution, department, title, bio
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.msg === 'Profile updated') {
        // Update profile display on the page
        document.querySelector('.profile-name').textContent = fullName;
        document.querySelector('.profile-title').textContent = title;
        const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
        if (contactItems.length >= 3) {
          contactItems[0].textContent = email;
          contactItems[1].textContent = phone;
          contactItems[2].textContent = institution;
        }
        closeModalFunc();
      } else {
        alert('Failed to update profile.');
      }
    })
    .catch(err => {
      console.error(err);
      alert('Error updating profile.');
    });
  });
}
