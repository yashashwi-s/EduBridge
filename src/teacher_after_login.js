const hamburger = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');
hamburger.addEventListener('click', () => {
  sidebar.classList.toggle('expanded');
});
const profileWrapper = document.querySelector('.profile-wrapper');
const profileDropdown = document.querySelector('.profile-dropdown');
profileWrapper.addEventListener('click', (e) => {
  e.stopPropagation();
  profileDropdown.classList.toggle('show');
});
document.addEventListener('click', () => {
  profileDropdown.classList.remove('show');
});
const addClassroomBtn = document.getElementById('addClassroomBtn');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
function openModal() {
  modal.style.display = 'block';
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
const classroomForm = document.getElementById('classroomForm');
const cardsContainer = document.getElementById('cards-container');
const backgroundImages = [
  'https://www.gstatic.com/classroom/themes/img_graduation.jpg',
  'https://www.gstatic.com/classroom/themes/img_code.jpg',
  'https://www.gstatic.com/classroom/themes/img_bookclub.jpg',
  'https://www.gstatic.com/classroom/themes/img_breakfast.jpg',
  'https://www.gstatic.com/classroom/themes/img_reachout.jpg',
  'https://www.gstatic.com/classroom/themes/img_learnlanguage.jpg'
];
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
      <button class="visit-btn" data-id="${classData._id}">Visit Classroom</button>
    </div>
  `;
  cardsContainer.appendChild(card);
}
function fetchTeacherClasses() {
  const token = localStorage.getItem('access_token') || '';
  fetch('/api/classrooms', {
    method: 'GET',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    }
  })
  .then(res => {
    if (!res.ok) throw new Error('Network response was not ok: ' + res.statusText);
    return res.json();
  })
  .then(classes => {
    cardsContainer.innerHTML = '';
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
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('visit-btn')) {
    const id = e.target.getAttribute('data-id');
    window.location.href = `/teacher_classroom.html?classroomId=${id}`;
  }
});
document.addEventListener('DOMContentLoaded', fetchTeacherClasses);
