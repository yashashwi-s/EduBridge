// Sidebar toggle functionality using hamburger button
const hamburger = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
hamburger.addEventListener('click', () => {
  sidebar.classList.toggle('expanded');
});

// Profile dropdown functionality
const profileWrapper = document.querySelector('.profile-wrapper');
const profileDropdown = document.querySelector('.profile-dropdown');
profileWrapper.addEventListener('click', (e) => {
  e.stopPropagation();
  profileDropdown.classList.toggle('show');
});
// Hide dropdown if clicked outside
document.addEventListener('click', () => {
  profileDropdown.classList.remove('show');
});

// Modal functionality for Add Classroom
const addClassroomBtn = document.getElementById('addClassroomBtn');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');

function openModal() {
  modal.style.display = 'block';
  // Trigger reflow
  modal.offsetWidth;
  modal.classList.add('show');
}

function closeModalFunc() {
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

addClassroomBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFunc);
cancelBtn.addEventListener('click', closeModalFunc);

window.addEventListener('click', (e) => {
  if (e.target == modal) {
    closeModalFunc();
  }
});

// Handle Add Classroom form submission
const classroomForm = document.getElementById('classroomForm');
const cardsContainer = document.getElementById('cards-container');

// Background images array for random assignment
const backgroundImages = [
  'https://www.gstatic.com/classroom/themes/img_graduation.jpg',
  'https://www.gstatic.com/classroom/themes/img_code.jpg',
  'https://www.gstatic.com/classroom/themes/img_bookclub.jpg',
  'https://www.gstatic.com/classroom/themes/img_breakfast.jpg',
  'https://www.gstatic.com/classroom/themes/img_reachout.jpg',
  'https://www.gstatic.com/classroom/themes/img_learnlanguage.jpg'
];

classroomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(classroomForm);

  // Create new classroom card
  const card = document.createElement('div');
  card.className = 'card';
  card.style = `--i:${document.querySelectorAll('.card').length}`;

  // Pick a random background
  const randomBackground = backgroundImages[Math.floor(Math.random() * backgroundImages.length)];

  card.innerHTML = `
    <div class="card-header" style="background-image: url('${randomBackground}')">
      <h2>${formData.get('className')}</h2>
    </div>
    <div class="card-content">
      <p>${formData.get('subject')}</p>
      <div class="card-info">
        <div>Section: ${formData.get('section')}</div>
        <div>Room: ${formData.get('room')}</div>
      </div>
    </div>
    <div class="card-actions">
      <button class="visit-btn">Visit Classroom</button>
    </div>
  `;

  // Add card to container
  cardsContainer.appendChild(card);

  // Close modal and reset form
  closeModalFunc();
  classroomForm.reset();
});

// Add click functionality to all visit buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('visit-btn')) {
    alert('Classroom functionality would open here');
  }
});
