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

// Reference to the classroom form and the container for cards
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

// Function to create a classroom card for teacher dashboard
function addNewTeacherClassCard(classData) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style = `--i:${document.querySelectorAll('.card').length}`;
  const headerImage = classData.headerImage || backgroundImages[Math.floor(Math.random() * backgroundImages.length)];
  
  card.innerHTML = `
    <div class="card-header" style="background-image: url('${headerImage}')">
      <h2>${classData.className}</h2>
    </div>
    <div class="card-content">
      <p>${classData.subject}</p>
      <div class="card-info">
        <div>Section: ${classData.section}</div>
        <div>Room: ${classData.room}</div>
        <p class="class-code">Class Code: ${classData.classCode}</p>
        <p class="teacher-name">Created by: ${classData.teacherName}</p>
      </div>
    </div>
    <div class="card-actions">
      <button class="visit-btn">Visit Classroom</button>
    </div>
  `;
  cardsContainer.appendChild(card);
}

// Function to fetch teacher classrooms from the API
function fetchTeacherClasses() {
  const token = localStorage.getItem('access_token') || '';
  fetch('/api/classrooms', {
    method: 'GET',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
  })
    .then(res => res.json())
    .then(classes => {
      cardsContainer.innerHTML = ''; // Clear any previous cards
      if (classes.length === 0) {
        cardsContainer.innerHTML = '<p>You have not created any classrooms yet.</p>';
      } else {
        classes.forEach(cls => {
          addNewTeacherClassCard(cls);
        });
      }
    })
    .catch(err => {
      console.error('Error fetching classrooms:', err);
      cardsContainer.innerHTML = '<p>Error loading classrooms.</p>';
    });
}

// Handle Add Classroom form submission
classroomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(classroomForm);
  const classroomData = {
    className: formData.get('className'),
    subject: formData.get('subject'),
    section: formData.get('section'),
    room: formData.get('room')
  };

  fetch('/api/classrooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('access_token')
    },
    body: JSON.stringify(classroomData)
  })
  .then(res => res.json())
  .then(response => {
    if (response && response.classroom) {
      // Instead of manually appending the new card,
      // refresh the list to include all classrooms (including the new one).
      fetchTeacherClasses();
      closeModalFunc();
      classroomForm.reset();
    } else {
      alert('Failed to create classroom');
    }
  })
  .catch(err => {
    console.error(err);
    alert('Error creating classroom');
  });
});

// Add click functionality to all visit buttons (delegated)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('visit-btn')) {
    window.location.href = '/teacher_classroom';
  }
});

// On page load, fetch and display teacher classrooms
document.addEventListener('DOMContentLoaded', fetchTeacherClasses);
