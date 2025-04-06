// Calendar functionality

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

// Initialize empty events data object
const eventsData = {};

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

// Function to format a date in user's timezone with timezone indicator
function formatTimeWithTimezone(date) {
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };
  
  return date.toLocaleTimeString([], options);
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
      
      // Add data attribute for classroom events for styling
      if (event.isClassroomEvent) {
        eventItem.setAttribute('data-classroom-event', 'true');
      }
      
      let classroomText = '';
      if (event.classroom) {
        classroomText = `<div class="event-classroom">${event.classroom}</div>`;
      }
      
      // Time information display
      let timeText = '';
      if (event.timeFormatted) {
        timeText = `<div class="event-time"><i class="far fa-clock"></i> ${event.timeFormatted}</div>`;
        
        // If it's a quiz with duration, add duration info
        if (event.type === 'test' && event.duration) {
          timeText += `<div class="event-duration"><i class="fas fa-hourglass-half"></i> ${event.duration} minutes</div>`;
        }
      }
      
      eventItem.innerHTML = `
        <div class="event-title">${event.title}</div>
        ${classroomText}
        ${timeText}
        <div class="event-type"><i class="fas ${event.icon}"></i> ${event.type.charAt(0).toUpperCase() + event.type.slice(1)}</div>
      `;
      
      // Add the description for personal events
      if (event.description && !event.isClassroomEvent) {
        const descDiv = document.createElement('div');
        descDiv.className = 'event-description';
        descDiv.innerHTML = event.description;
        eventItem.appendChild(descDiv);
      }
      
      // Add options to edit or delete event - only for personal events
      const eventActions = document.createElement('div');
      eventActions.className = 'event-actions';
      
      if (event.isClassroomEvent) {
        // For classroom events, add a "View in Classroom" button
        eventActions.innerHTML = `
          <button class="action-btn view-classroom"><i class="fas fa-external-link-alt"></i></button>
        `;
        
        const viewClassroomBtn = eventActions.querySelector('.view-classroom');
        viewClassroomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = `/student_classroom?classroomId=${event.classroomId}`;
        });
      } else {
        // For personal events, show edit and delete buttons
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
        
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm("Are you sure you want to delete this event?")) {
            if (await deletePersonalEvent(dateKey, event.id)) {
              // Close the modal
              closeModalFunc();
              showNotification("Event deleted successfully", "success");
            } else {
              showNotification("Failed to delete event", "error");
            }
          }
        });
      }
      
      eventItem.appendChild(eventActions);
      
      // Make eventItem clickable to view full details
      eventItem.addEventListener('click', () => {
        if (event.isClassroomEvent) {
          window.location.href = `/student_classroom?classroomId=${event.classroomId}`;
        }
        // No longer needed since we now show the description directly in the event item
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
    quickAddBtn.innerHTML = '<i class="fas fa-plus"></i> Add Personal Event';
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

async function addNewEvent(event) {
  event.preventDefault();
  
  const formData = new FormData(eventForm);
  const eventTitle = formData.get('eventTitle');
  const eventDate = formData.get('eventDate');
  const eventTime = formData.get('eventTime');
  const eventDescription = formData.get('eventDescription');
  
  // Generate a unique ID
  const eventId = 'event_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  
  // Create new event object - always personal type
  const newEvent = {
    id: eventId,
    title: eventTitle,
    type: "personal",
    icon: "fa-user",
    description: eventDescription,
    date: eventDate,
    time: eventTime || null
  };
  
  // Add time information if provided
  if (eventTime) {
    // Create Date object from date and time
    const [hours, minutes] = eventTime.split(':');
    const dateObj = new Date(eventDate);
    dateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
    
    newEvent.time = dateObj;
    newEvent.timeFormatted = formatTimeWithTimezone(dateObj);
  }
  
  try {
    // Get existing personal events
    const allPersonalEvents = await fetchPersonalEvents();
    
    // Add the new event
    allPersonalEvents.push(newEvent);
    
    // Save all events back to localStorage
    savePersonalEventsToLocalStorage(allPersonalEvents);
    
    // Add event to local eventsData
    if (!eventsData[eventDate]) {
      eventsData[eventDate] = [];
    }
    eventsData[eventDate].push(newEvent);
    
    // Re-render the calendar to show the new event
    renderCalendar(currentDate);
    
    // Close the modal
    closeAddEventModal();
    
    // Show success message
    showNotification(`Personal event "${eventTitle}" added successfully!`, "success");
  } catch (error) {
    console.error('Error saving event:', error);
    showNotification('Failed to save event. Please try again.', 'error');
    
    // Still add to local eventsData in case of storage failure
    if (!eventsData[eventDate]) {
      eventsData[eventDate] = [];
    }
    eventsData[eventDate].push(newEvent);
    renderCalendar(currentDate);
    closeAddEventModal();
  }
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

// Function to show a notification message
function showNotification(message, type = 'info') {
  // Create notification element if it doesn't exist
  let notification = document.querySelector('.calendar-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'calendar-notification';
    document.querySelector('.content').appendChild(notification);
  }
  
  // Set message and type
  notification.textContent = message;
  notification.className = `calendar-notification ${type}`;
  
  // Show the notification
  notification.classList.add('show');
  
  // Hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
  }, 5000);
}

// Function to fetch classroom data
async function fetchClassroomData() {
  try {
    // Get JWT token from localStorage - check all possible key names
    let token = localStorage.getItem('access_token') || 
               localStorage.getItem('accessToken') || 
               localStorage.getItem('token');
    
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    // API call to get classrooms data with authentication
    const response = await fetch('/api/classrooms', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch classroom data');
    }
    
    const classrooms = await response.json();
    return classrooms;
  } catch (error) {
    console.error('Error fetching classroom data:', error);
    return [];
  }
}

// Function to extract events from classroom data (student perspective)
function extractClassroomEvents(classrooms) {
  const events = [];
  
  classrooms.forEach(classroom => {
    // Extract announcements
    if (classroom.announcements && classroom.announcements.length > 0) {
      classroom.announcements.forEach(announcement => {
        // Only add if it has a date
        if (announcement.postTime) {
          // Create date in local timezone
          const date = new Date(announcement.postTime);
          const dateKey = formatDateForInput(date);
          
          events.push({
            dateKey,
            event: {
              title: `Announcement: ${classroom.className}`,
              type: "announcement",
              icon: "fa-bullhorn",
              classroom: classroom.className,
              id: announcement.announcement_id,
              classroomId: classroom._id,
              isClassroomEvent: true,
              time: date,
              timeFormatted: formatTimeWithTimezone(date)
            }
          });
        }
      });
    }
    
    // Extract quizzes
    if (classroom.quizzes && classroom.quizzes.length > 0) {
      classroom.quizzes.forEach(quiz => {
        // Only add if it has a start time and is published
        if (quiz.startTime && quiz.published) {
          // Create date in local timezone
          const date = new Date(quiz.startTime);
          const dateKey = formatDateForInput(date);
          
          events.push({
            dateKey,
            event: {
              title: `Quiz: ${quiz.title}`,
              type: "test",
              icon: "fa-file-alt",
              classroom: classroom.className,
              id: quiz.id,
              classroomId: classroom._id,
              isClassroomEvent: true,
              time: date,
              timeFormatted: formatTimeWithTimezone(date),
              duration: quiz.duration
            }
          });
        }
      });
    }
    
    // Extract assignment deadlines if available
    if (classroom.assignments && classroom.assignments.length > 0) {
      classroom.assignments.forEach(assignment => {
        if (assignment.dueDate) {
          // Create date in local timezone
          const date = new Date(assignment.dueDate);
          const dateKey = formatDateForInput(date);
          
          events.push({
            dateKey,
            event: {
              title: `Due: ${assignment.title}`,
              type: "deadline",
              icon: "fa-clock",
              classroom: classroom.className,
              id: assignment.id,
              classroomId: classroom._id,
              isClassroomEvent: true,
              time: date,
              timeFormatted: formatTimeWithTimezone(date)
            }
          });
        }
      });
    }
  });
  
  return events;
}

// Function to add classroom events to the calendar
function addClassroomEventsToCalendar(events) {
  events.forEach(({ dateKey, event }) => {
    if (!eventsData[dateKey]) {
      eventsData[dateKey] = [];
    }
    
    // Check if event already exists to avoid duplicates
    const exists = eventsData[dateKey].some(e => 
      e.isClassroomEvent && e.id === event.id && e.classroomId === event.classroomId
    );
    
    if (!exists) {
      eventsData[dateKey].push(event);
    }
  });
  
  // Re-render the calendar to show the updated events
  renderCalendar(currentDate);
}

// Function to fetch personal events from localStorage
async function fetchPersonalEvents() {
  try {
    // Get events from localStorage
    const storedEvents = localStorage.getItem('student_personal_calendar_events');
    if (!storedEvents) {
      return [];
    }
    
    const personalEvents = JSON.parse(storedEvents);
    console.log('Loaded personal events from localStorage:', personalEvents.length);
    return personalEvents;
  } catch (error) {
    console.error('Error fetching personal events from localStorage:', error);
    return [];
  }
}

// Function to save personal events to localStorage
function savePersonalEventsToLocalStorage(events) {
  try {
    localStorage.setItem('student_personal_calendar_events', JSON.stringify(events));
    console.log('Saved personal events to localStorage');
    return true;
  } catch (error) {
    console.error('Error saving personal events to localStorage:', error);
    return false;
  }
}

// Function to add personal events from localStorage to the calendar
function addPersonalEventsToCalendar(events) {
  if (!events || !Array.isArray(events)) {
    console.log('No valid personal events to add');
    return;
  }
  
  events.forEach(event => {
    // Create date in local timezone
    const date = new Date(event.date);
    const dateKey = formatDateForInput(date);
    
    // Create event object
    const newEvent = {
      id: event.id,
      title: event.title,
      type: "personal",
      icon: "fa-user",
      description: event.description
    };
    
    // Add time information if available
    if (event.time) {
      const timeDate = new Date(`${event.date}T${event.time}`);
      newEvent.time = timeDate;
      newEvent.timeFormatted = formatTimeWithTimezone(timeDate);
    }
    
    // Add event to eventsData
    if (!eventsData[dateKey]) {
      eventsData[dateKey] = [];
    }
    
    // Check if event already exists to avoid duplicates
    const exists = eventsData[dateKey].some(e => 
      (e.id && e.id === newEvent.id) || 
      (e.title === newEvent.title && e.type === newEvent.type && e.description === newEvent.description)
    );
    
    if (!exists) {
      eventsData[dateKey].push(newEvent);
    }
  });
  
  // Re-render the calendar
  renderCalendar(currentDate);
}

// Function to update delete functionality to use localStorage
async function deletePersonalEvent(dateKey, eventId) {
  try {
    const allPersonalEvents = await fetchPersonalEvents();
    
    // Filter out the event to delete
    const updatedEvents = allPersonalEvents.filter(event => event.id !== eventId);
    
    // Save updated events back to localStorage
    savePersonalEventsToLocalStorage(updatedEvents);
    
    // Update local events data
    const eventIndex = eventsData[dateKey].findIndex(e => e.id === eventId);
    if (eventIndex !== -1) {
      eventsData[dateKey].splice(eventIndex, 1);
      
      // If no more events on this day, remove the day entry
      if (eventsData[dateKey].length === 0) {
        delete eventsData[dateKey];
      }
    }
    
    // Re-render calendar
    renderCalendar(currentDate);
    
    return true;
  } catch (error) {
    console.error('Error deleting event:', error);
    return false;
  }
}

// Function to load all events (both classroom and personal)
async function loadAllEvents() {
  try {
    // Load classroom events
    const classrooms = await fetchClassroomData();
    if (classrooms && classrooms.length > 0) {
      const classroomEvents = extractClassroomEvents(classrooms);
      addClassroomEventsToCalendar(classroomEvents);
    }
    
    // Load personal events
    const personalEvents = await fetchPersonalEvents();
    if (personalEvents && personalEvents.length > 0) {
      addPersonalEventsToCalendar(personalEvents);
    }
  } catch (error) {
    console.error('Error loading events:', error);
  }
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

// Update the DOMContentLoaded event handler to load all events
document.addEventListener('DOMContentLoaded', () => {
  renderCalendar(currentDate);
  
  // Always load events since we're using localStorage for personal events
  loadAllEvents();
  
  // Refresh events every 5 minutes
  setInterval(() => {
    loadAllEvents();
  }, 5 * 60 * 1000);
});