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

  // Handle Join Class form submission with API call
  joinClassForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const classCode = document.getElementById('classCode').value.trim();
    if (!classCode) {
      alert("Please enter a class code.");
      return;
    }
    fetch('/api/classrooms/join', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + localStorage.getItem('access_token')
      },
      body: JSON.stringify({ classCode: classCode })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.msg === 'Successfully joined the class') {
          // Refresh class list from API
          fetchClasses();
        } else {
          alert(data.msg);
        }
        closeModalFunction();
        joinClassForm.reset();
      })
      .catch((err) => {
        console.error('Error joining class:', err);
        alert('Error joining class.');
        closeModalFunction();
        joinClassForm.reset();
      });
  });

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

  // Function to create and add a new class card dynamically
  function addNewClassCard(classData) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style = `--i:${document.querySelectorAll('.card').length}`;
    // Set data attribute for class id (to use when visiting the class)
    card.setAttribute('data-id', classData._id);
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
        <button class="visit-btn">View Class</button>
      </div>
    `;
    
    // Add event listener to the visit button to redirect to the class detail page.
    const visitBtn = card.querySelector('.visit-btn');
    visitBtn.addEventListener('click', function () {
      // Retrieve class id from data attribute and redirect.
      const classId = card.getAttribute('data-id');
      // Redirect to student_classroom 
      window.location.href = `/student_classroom?classId=${classId}`;
    });
    
    cardsContainer.appendChild(card);
  }

  // Function to fetch classes dynamically from API (/api/classrooms)
  function fetchClasses() {
    const token = localStorage.getItem('access_token') || '';
    fetch('/api/classrooms', {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + token 
      },
    })
      .then((res) => res.json())
      .then((classes) => {
        cardsContainer.innerHTML = '';
        if (classes.length === 0) {
          cardsContainer.innerHTML = '<p>You are not enrolled in any classes yet.</p>';
        } else {
          classes.forEach((cls) => {
            addNewClassCard(cls);
          });
        }
      })
      .catch((err) => {
        console.error('Error fetching classes:', err);
        cardsContainer.innerHTML = '<p>Error loading classes.</p>';
      });
  }

  // Initial fetch of classes on page load
  fetchClasses();
});
