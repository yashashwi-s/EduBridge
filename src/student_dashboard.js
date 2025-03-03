document.addEventListener('DOMContentLoaded', function() {
  // Toggle sidebar expansion
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  
  hamburger.addEventListener('click', function() {
    sidebar.classList.toggle('expanded');
  });
  
  // Profile dropdown toggle
  const profileIcon = document.querySelector('.profile-icon');
  const profileDropdown = document.querySelector('.profile-dropdown');
  
  profileIcon.addEventListener('click', function(event) {
    event.stopPropagation();
    profileDropdown.classList.toggle('show');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', function() {
    if (profileDropdown.classList.contains('show')) {
      profileDropdown.classList.remove('show');
    }
  });
  
  // Modal functionality
  const joinClassBtn = document.getElementById('joinClassBtn');
  const modal = document.getElementById('modal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const joinClassForm = document.getElementById('joinClassForm');
  
  joinClassBtn.addEventListener('click', function() {
    modal.classList.add('show');
  });
  
  function closeModalFunction() {
    modal.classList.remove('show');
  }
  
  closeModal.addEventListener('click', closeModalFunction);
  cancelBtn.addEventListener('click', closeModalFunction);
  
  // Close modal when clicking outside of it
  window.addEventListener('click', function(event) {
    if (event.target === modal) {
      closeModalFunction();
    }
  });
  
  // Form submission
  joinClassForm.addEventListener('submit', function(event) {
    event.preventDefault();
    
    const classCode = document.getElementById('classCode').value;
    
    // Here you would typically send a request to join the class
    console.log(`Joining class with code: ${classCode}`);
    
    // Add animation to newly joined class
    addNewClass(classCode);
    
    // Close modal and reset form
    closeModalFunction();
    joinClassForm.reset();
  });
  
  // Function to add a new class card
  function addNewClass(classCode) {
    const cardsContainer = document.getElementById('cards-container');
    const cardCount = cardsContainer.querySelectorAll('.card').length;
    
    // Create new card with sample data
    const newCard = document.createElement('div');
    newCard.className = 'card';
    newCard.style = `--i:${cardCount}`;
    
    // Generate a random header image
    const headerImages = [
      'https://www.gstatic.com/classroom/themes/img_reachout.jpg',
      'https://www.gstatic.com/classroom/themes/Chemistry.jpg',
      'https://www.gstatic.com/classroom/themes/img_breakfast.jpg',
      'https://www.gstatic.com/classroom/themes/img_arts.jpg'
    ];
    
    const randomImage = headerImages[Math.floor(Math.random() * headerImages.length)];
    
    newCard.innerHTML = `
      <div class="card-header" style="background-image: url('${randomImage}')">
        <h2>New Class ${classCode}</h2>
      </div>
      <div class="card-content">
        <p>Instructor: To be announced</p>
        <div class="card-info">
          <div><i class="fas fa-users"></i> Section: TBA</div>
          <div><i class="fas fa-door-open"></i> Room: TBA</div>
          <div><i class="fas fa-clock"></i> Schedule: TBA</div>
        </div>
      </div>
      <div class="card-actions">
        <button class="visit-btn">View Class</button>
      </div>
    `;
    
    // Add to container with animation
    cardsContainer.appendChild(newCard);
    
    // Apply animation
    setTimeout(() => {
      newCard.style.opacity = '1';
    }, 10);
  }
});