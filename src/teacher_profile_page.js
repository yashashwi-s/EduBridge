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
    // Disable background scrolling
    document.body.style.overflow = 'hidden';
  }
}

function closeModalFunc() {
  if (profileModal) {
    profileModal.classList.remove('show');
    // Re-enable scrolling after modal closes
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

// Handle Edit Profile form submission and update profile section
const profileForm = document.getElementById('profileForm');
if (profileForm) {
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Get new values from the form
    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const institution = document.getElementById('institution').value;
    const department = document.getElementById('department').value;
    const title = document.getElementById('title').value;
    const bio = document.getElementById('bio').value;

    // Update profile sidebar details
    document.querySelector('.profile-name').textContent = fullName;
    document.querySelector('.profile-title').textContent = title;
    const contactItems = document.querySelectorAll('.profile-contact .contact-item span');
    if (contactItems.length >= 3) {
      contactItems[0].textContent = email;       // Update Email
      contactItems[1].textContent = phone;         // Update Phone
      contactItems[2].textContent = institution;   // Update Institution
    }

    // Update Personal Information card (Full Name)
    const personalInfoFullName = document.querySelector('.profile-main .info-card:nth-child(1) .info-item:nth-child(1) .info-value');
    if (personalInfoFullName) {
      personalInfoFullName.textContent = fullName;
    }

    // Update Teaching Information card (Department)
    const teachingDepartment = document.querySelector('.profile-main .info-card:nth-child(3) .info-item:nth-child(1) .info-value');
    if (teachingDepartment) {
      teachingDepartment.textContent = department;
    }

    // Update Bio card
    const bioCard = document.querySelector('.profile-main .info-card:nth-child(6) p');
    if (bioCard) {
      bioCard.textContent = bio;
    }

    // Close the modal overlay and re-enable scrolling
    closeModalFunc();
  });
}
