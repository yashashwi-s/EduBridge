// Calendar functionality

// Get elements
const monthYearEl = document.getElementById('monthYear');
const calendarGrid = document.querySelector('.calendar-grid');

// Modal elements
const dayModal = document.getElementById('dayModal');
const closeDayModal = document.getElementById('closeDayModal');
const modalDateEl = document.getElementById('modalDate');
const eventsList = document.getElementById('eventsList');

// Navigation buttons
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const todayBtn = document.getElementById('todayBtn');

// Profile dropdown toggle
const profileIcon = document.querySelector('.profile-icon');
const profileDropdown = document.querySelector('.profile-dropdown');

// Sidebar toggle
const hamburgerBtn = document.getElementById('hamburger');
const sidebar = document.querySelector('.sidebar');

let currentDate = new Date();

// Sample events data (keyed by date in YYYY-MM-DD format)
const eventsData = {
  "2025-03-05": [
    { title: "Exam Schedule Posted", type: "announcement", icon: "fa-bullhorn" },
    { title: "Homework Deadline", type: "deadline", icon: "fa-clock" }
  ],
  "2025-03-10": [
    { title: "Test: Physics 101", type: "test", icon: "fa-file-alt" },
    { title: "Assignment Submission Open", type: "submission", icon: "fa-upload" }
  ],
  "2025-03-12": [
    { title: "Study Group Meeting", type: "personal", icon: "fa-user" },
    { title: "Chemistry Lab Report Due", type: "deadline", icon: "fa-clock" }
  ],
  "2025-03-15": [
    { title: "Meeting with tutor", type: "personal", icon: "fa-user" }
  ],
  "2025-03-18": [
    { title: "Course Selection Opens", type: "announcement", icon: "fa-bullhorn" },
    { title: "Math Quiz", type: "test", icon: "fa-file-alt" }
  ],
  "2025-03-22": [
    { title: "Research Paper Deadline", type: "deadline", icon: "fa-clock" },
    { title: "Group Project Check-in", type: "submission", icon: "fa-upload" }
  ],
  "2025-03-08": [
    { title: "Weekend Study Session", type: "personal", icon: "fa-user" },
    { title: "Library Hours Extended", type: "announcement", icon: "fa-bullhorn" }
  ]
};

function formatDateForDisplay(dateString) {
  const [year, month, day] = dateString.split('-');
  const date = new Date(year, month - 1, day);
  
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function renderCalendar(date) {
  // Clear previous cells (except day names)
  const dayCells = document.querySelectorAll('.calendar-day');
  dayCells.forEach(cell => cell.remove());

  const year = date.getFullYear();
  const month = date.getMonth();

  // Set header month and year
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthYearEl.textContent = `${monthNames[month]} ${year}`;

  // First day of month
  const firstDay = new Date(year, month, 1).getDay();
  // Number of days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Get current day for highlighting today
  const today = new Date();
  const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month);
  const currentDay = today.getDate();

  // Fill in blank cells for previous month days
  for (let i = 0; i < firstDay; i++) {
    const blankCell = document.createElement('div');
    blankCell.className = 'calendar-day empty';
    calendarGrid.appendChild(blankCell);
  }

  // Create cells for each day
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    cell.setAttribute('data-date', dateKey);
    
    // Highlight today
    if (isCurrentMonth && day === currentDay) {
      cell.classList.add('today');
    }

    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    // If there are events on this day, add indicators and previews
    if (eventsData[dateKey] && eventsData[dateKey].length > 0) {
      const eventCount = eventsData[dateKey].length;
      
      // Add event count badge
      const countBadge = document.createElement('div');
      countBadge.className = 'event-count';
      countBadge.textContent = eventCount;
      cell.appendChild(countBadge);
      
      // Add event indicators
      const indicators = document.createElement('div');
      indicators.className = 'event-indicators';
      
      // Show event previews (limited to 2)
      const previewLimit = Math.min(2, eventCount);
      for (let i = 0; i < previewLimit; i++) {
        const event = eventsData[dateKey][i];
        const preview = document.createElement('div');
        preview.className = `event-preview event-${event.type}`;
        preview.textContent = event.title;
        cell.appendChild(preview);
        
        // Also add indicator dots
        const dot = document.createElement('div');
        dot.className = `event-indicator event-${event.type}`;
        indicators.appendChild(dot);
      }
      
      // If more than 2 events, add "more" text
      if (eventCount > 2) {
        const moreText = document.createElement('div');
        moreText.textContent = `+ ${eventCount - 2} more`;
        moreText.style.fontSize = '10px';
        moreText.style.textAlign = 'right';
        moreText.style.marginTop = '4px';
        moreText.style.color = '#5f6368';
        cell.appendChild(moreText);
      }
      
      cell.appendChild(indicators);
    }

    // Add click event to open modal with events details
    cell.addEventListener('click', () => openDayModal(dateKey));

    calendarGrid.appendChild(cell);
  }
}

function openDayModal(dateKey) {
  modalDateEl.textContent = formatDateForDisplay(dateKey);
  eventsList.innerHTML = "";
  
  if (eventsData[dateKey] && eventsData[dateKey].length > 0) {
    eventsData[dateKey].forEach(event => {
      const eventItem = document.createElement('div');
      eventItem.className = `event-item ${event.type}`;
      eventItem.innerHTML = `
        <div class="event-title">${event.title}</div>
        <div class="event-type"><i class="fas ${event.icon}"></i> ${event.type.charAt(0).toUpperCase() + event.type.slice(1)}</div>
      `;
      
      // Make eventItem clickable to navigate to related page
      eventItem.addEventListener('click', () => {
        alert("Navigating to the event details for: " + event.title);
      });
      
      eventsList.appendChild(eventItem);
    });
  } else {
    const noEvents = document.createElement('div');
    noEvents.style.padding = '16px';
    noEvents.style.textAlign = 'center';
    noEvents.style.color = '#5f6368';
    noEvents.innerHTML = '<i class="far fa-calendar-times" style="font-size: 32px; margin-bottom: 8px;"></i><p>No events scheduled for this day.</p>';
    eventsList.appendChild(noEvents);
  }
  
  dayModal.style.display = 'block';
  dayModal.offsetWidth; // Force reflow
  dayModal.classList.add('show');
}

function closeModalFunc() {
  dayModal.classList.remove('show');
  setTimeout(() => {
    dayModal.style.display = 'none';
  }, 300);
}

// Toggle profile dropdown
profileIcon.addEventListener('click', () => {
  profileDropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!profileIcon.contains(e.target) && !profileDropdown.contains(e.target)) {
    profileDropdown.classList.remove('show');
  }
});

// Toggle sidebar
hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.toggle('expanded');
});

// Navigation event listeners
prevMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar(currentDate);
});

nextMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar(currentDate);
});

todayBtn.addEventListener('click', () => {
  currentDate = new Date();
  renderCalendar(currentDate);
});

// Close modal when clicking on close button or outside modal content
closeDayModal.addEventListener('click', closeModalFunc);
window.addEventListener('click', (e) => {
  if (e.target === dayModal) {
    closeModalFunc();
  }
});

// Add keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dayModal.classList.contains('show')) {
    closeModalFunc();
  }
});

// Initial render
renderCalendar(currentDate);