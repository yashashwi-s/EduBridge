// Calendar functionality for Teacher

// Get elements
const monthYearEl = document.getElementById('monthYear');
const calendarGrid = document.querySelector('.calendar-grid');

// Modal elements for viewing events
const dayModal = document.getElementById('dayModal');
const closeDayModal = document.getElementById('closeDayModal');
const modalDateEl = document.getElementById('modalDate');
const eventsList = document.getElementById('eventsList');

// Modal elements for adding events
const addEventModal = document.getElementById('addEventModal');
const closeEventModal = document.getElementById('closeEventModal');
const addEventBtn = document.getElementById('addEventBtn');
const cancelEventBtn = document.getElementById('cancelEventBtn');
const eventForm = document.getElementById('eventForm');
const eventDateInput = document.getElementById('eventDate');
const eventClassroomSelect = document.getElementById('eventClassroom');

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
let selectedDate = null; // For tracking selected date in add event modal

// Sample events data (keyed by date in YYYY-MM-DD format)
const eventsData = {
  "2025-03-05": [
    { title: "Post Midterm Schedule", type: "announcement", icon: "fa-bullhorn", classroom: "Physics 101" },
    { title: "Assignment Deadline", type: "deadline", icon: "fa-clock", classroom: "Computer Science" }
  ],
  "2025-03-10": [
    { title: "Midterm Exam", type: "test", icon: "fa-file-alt", classroom: "Physics 101" },
    { title: "Open Submissions", type: "submission", icon: "fa-upload", classroom: "Biology" }
  ],
  "2025-03-12": [
    { title: "Department Meeting", type: "personal", icon: "fa-user" },
    { title: "Lab Report Deadline", type: "deadline", icon: "fa-clock", classroom: "Chemistry" }
  ],
  "2025-03-15": [
    { title: "Parent-Teacher Conference", type: "personal", icon: "fa-user" }
  ],
  "2025-03-18": [
    { title: "Finalize Grades", type: "announcement", icon: "fa-bullhorn", classroom: "All Classes" },
    { title: "Pop Quiz", type: "test", icon: "fa-file-alt", classroom: "Mathematics" }
  ],
  "2025-03-22": [
    { title: "Research Paper Due", type: "deadline", icon: "fa-clock", classroom: "Literature" },
    { title: "Project Presentations", type: "submission", icon: "fa-upload", classroom: "Computer Science" }
  ],
  "2025-03-08": [
    { title: "Grading Session", type: "personal", icon: "fa-user" },
    { title: "Syllabus Update", type: "announcement", icon: "fa-bullhorn", classroom: "All Classes" }
  ]
};

// Sample classrooms data (would be fetched from API in production)
const classroomsData = [
  { id: "class1", name: "Mathematics 101", subject: "Mathematics" },
  { id: "class2", name: "Physics 101", subject: "Physics" },
  { id: "class3", name: "Computer Science", subject: "CS" },
  { id: "class4", name: "Biology", subject: "Biology" },
  { id: "class5", name: "Chemistry", subject: "Chemistry" },
  { id: "class6", name: "Literature", subject: "English" }
];

// Populate classrooms dropdown
function populateClassroomsDropdown() {
  classroomsData.forEach(classroom => {
    const option = document.createElement('option');
    option.value = classroom.id;
    option.textContent = classroom.name;
    eventClassroomSelect.appendChild(option);
  });
}

function formatDateForDisplay(dateString) {
  const [year, month, day] = dateString.split('-');
  const date = new Date(year, month - 1, day);
  
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      
      let classroomText = '';
      if (event.classroom) {
        classroomText = `<div class="event-classroom">${event.classroom}</div>`;
      }
      
      eventItem.innerHTML = `
        <div class="event-title">${event.title}</div>
        ${classroomText}
        <div class="event-type"><i class="fas ${event.icon}"></i> ${event.type.charAt(0).toUpperCase() + event.type.slice(1)}</div>
      `;
      
      // Add options to edit or delete event
      const eventActions = document.createElement('div');
      eventActions.className = 'event-actions';
      eventActions.innerHTML = `
        <button class="action-btn edit"><i class="fas fa-edit"></i></button>
        <button class="action-btn delete"><i class="fas fa-trash"></i></button>
      `;
      
      // Add event listeners for edit and delete actions
      const editBtn = eventActions.querySelector('.edit');
      const deleteBtn = eventActions.querySelector('.delete');
      
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert("Edit event: " + event.title);
        // Here you would implement opening the edit form with pre-filled data
      });
      
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this event?")) {
          // Here you would implement deleting the event from eventsData
          const index = eventsData[dateKey].findIndex(e => e.title === event.title && e.type === event.type);
          if (index !== -1) {
            eventsData[dateKey].splice(index, 1);
            // If no more events on this day, remove the day entry
            if (eventsData[dateKey].length === 0) {
              delete eventsData[dateKey];
            }
            // Re-render the calendar and close the modal
            renderCalendar(currentDate);
            closeModalFunc();
          }
        }
      });
      
      eventItem.appendChild(eventActions);
      
      // Make eventItem clickable to view full details
      eventItem.addEventListener('click', () => {
        alert("Viewing full details for: " + event.title);
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
    
    // Add a quick "Add Event" button when no events exist
    const quickAddBtn = document.createElement('button');
    quickAddBtn.className = 'submit-btn';
    quickAddBtn.style.margin = '16px auto';
    quickAddBtn.style.display = 'block';
    quickAddBtn.innerHTML = '<i class="fas fa-plus"></i> Add Event';
    quickAddBtn.addEventListener('click', () => {
      closeModalFunc();
      openAddEventModal(dateKey);
    });
    eventsList.appendChild(quickAddBtn);
  }
  
  dayModal.style.display = 'block';
  dayModal.offsetWidth; // Force reflow
  dayModal.classList.add('show');
}

function openAddEventModal(dateKey) {
  // If a date is provided, set the date input
  if (dateKey) {
    eventDateInput.value = dateKey;
    selectedDate = dateKey;
  } else {
    // Otherwise default to today's date
    const today = new Date();
    eventDateInput.value = formatDateForInput(today);
    selectedDate = formatDateForInput(today);
  }
  
  // Reset form
  eventForm.reset();
  eventDateInput.value = selectedDate; // Set the date again after reset
  
  // Display the modal
  addEventModal.style.display = 'block';
  addEventModal.offsetWidth; // Force reflow
  addEventModal.classList.add('show');
}

function addNewEvent(event) {
  event.preventDefault();
  
  const formData = new FormData(eventForm);
  const eventTitle = formData.get('eventTitle');
  const eventDate = formData.get('eventDate');
  const eventType = formData.get('eventType');
  const eventDescription = formData.get('eventDescription');
  const eventClassroom = formData.get('eventClassroom');
  
  // Map event type to icon
  const iconMap = {
    'announcement': 'fa-bullhorn',
    'deadline': 'fa-clock',
    'test': 'fa-file-alt',
    'submission': 'fa-upload',
    'personal': 'fa-user'
  };
  
  // Create new event object
  const newEvent = {
    title: eventTitle,
    type: eventType,
    icon: iconMap[eventType] || 'fa-calendar',
    description: eventDescription
  };
  
  // Add classroom if selected
  if (eventClassroom) {
    const classroom = classroomsData.find(c => c.id === eventClassroom);
    if (classroom) {
      newEvent.classroom = classroom.name;
    }
  }
  
  // Add event to eventsData
  if (!eventsData[eventDate]) {
    eventsData[eventDate] = [];
  }
  eventsData[eventDate].push(newEvent);
  
  // Re-render the calendar to show the new event
  renderCalendar(currentDate);
  
  // Close the modal
  closeAddEventModal();
  
  // Show success message
  alert(`Event "${eventTitle}" added successfully!`);
}

function closeModalFunc() {
  dayModal.classList.remove('show');
  setTimeout(() => {
    dayModal.style.display = 'none';
  }, 300);
}

function closeAddEventModal() {
  addEventModal.classList.remove('show');
  setTimeout(() => {
    addEventModal.style.display = 'none';
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

// Add Event button
addEventBtn.addEventListener('click', () => {
  openAddEventModal();
});

// Form submission for adding new event
eventForm.addEventListener('submit', addNewEvent);

// Cancel button in add event form
cancelEventBtn.addEventListener('click', closeAddEventModal);

// Close modal when clicking on close button or outside modal content
closeDayModal.addEventListener('click', closeModalFunc);
closeEventModal.addEventListener('click', closeAddEventModal);

window.addEventListener('click', (e) => {
  if (e.target === dayModal) {
    closeModalFunc();
  }
  if (e.target === addEventModal) {
    closeAddEventModal();
  }
});

// Add keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (dayModal.classList.contains('show')) {
      closeModalFunc();
    }
    if (addEventModal.classList.contains('show')) {
      closeAddEventModal();
    }
  }
});

// Initialize calendar and populate dropdown
document.addEventListener('DOMContentLoaded', () => {
  renderCalendar(currentDate);
  populateClassroomsDropdown();
  
}); 