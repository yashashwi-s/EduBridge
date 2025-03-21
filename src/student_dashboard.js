document.addEventListener('DOMContentLoaded', function () {
  // Toggle sidebar expansion
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  hamburger.addEventListener('click', function () {
    sidebar.classList.toggle('expanded');
  });

  // Profile dropdown toggle
  const profileIcon = document.querySelector('.profile-icon');
  const profileDropdown = document.querySelector('.profile-dropdown');
  profileIcon.addEventListener('click', function (event) {
    event.stopPropagation();
    profileDropdown.classList.toggle('show');
  });
  document.addEventListener('click', function () {
    profileDropdown.classList.remove('show');
  });

  // Modal functionality for joining class
  const joinClassBtn = document.getElementById('joinClassBtn');
  const modal = document.getElementById('modal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const joinClassForm = document.getElementById('joinClassForm');

  joinClassBtn.addEventListener('click', function () {
    modal.classList.add('show');
  });
  function closeModalFunction() {
    modal.classList.remove('show');
  }
  closeModal.addEventListener('click', closeModalFunction);
  cancelBtn.addEventListener('click', closeModalFunction);
  window.addEventListener('click', function (event) {
    if (event.target === modal) closeModalFunction();
  });

  joinClassForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const classCode = document.getElementById('classCode').value;
    // API call to join class can be added here.
    console.log(`Joining class with code: ${classCode}`);
    // For now, add a new class card locally.
    addNewClassCard(classCode);
    closeModalFunction();
    joinClassForm.reset();
  });

  // Function to create and add a new class card dynamically
  function addNewClassCard(classCode, classData) {
    const cardsContainer = document.getElementById('cards-container');
    // Remove loading text if present
    if (cardsContainer.querySelector('p')) cardsContainer.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    // Use provided classData or fallback to placeholder data
    const headerImage = classData?.headerImage || 'https://www.gstatic.com/classroom/themes/img_graduation.jpg';
    const courseName = classData?.courseName || `New Class ${classCode}`;
    const instructor = classData?.instructor || 'TBA';
    const section = classData?.section || 'TBA';
    const room = classData?.room || 'TBA';
    const schedule = classData?.schedule || 'TBA';

    card.innerHTML = `
      <div class="card-header" style="background-image: url('${headerImage}')">
        <h2>${courseName}</h2>
      </div>
      <div class="card-content">
        <p>Instructor: ${instructor}</p>
        <div class="card-info">
          <div><i class="fas fa-users"></i> Section: ${section}</div>
          <div><i class="fas fa-door-open"></i> Room: ${room}</div>
          <div><i class="fas fa-clock"></i> ${schedule}</div>
        </div>
      </div>
      <div class="card-actions">
        <button class="visit-btn" onclick="window.location.href='announcements'">View Class</button>
      </div>
    `;
    cardsContainer.appendChild(card);
  }

  // Fetch classes dynamically from API (/api/classrooms)
  const token = localStorage.getItem('access_token') || '';
  fetch('/api/classrooms', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  })
    .then((res) => res.json())
    .then((classes) => {
      const container = document.getElementById('cards-container');
      container.innerHTML = '';
      if (classes.length === 0) {
        container.innerHTML = '<p>You are not enrolled in any classes yet.</p>';
      } else {
        classes.forEach((cls) => {
          // Assuming cls contains courseName, instructor, section, room, schedule, headerImage
          addNewClassCard(cls.classCode, cls);
        });
      }
    })
    .catch((err) => {
      console.error('Error fetching classes:', err);
      document.getElementById('cards-container').innerHTML =
        '<p>Error loading classes.</p>';
    });
});
