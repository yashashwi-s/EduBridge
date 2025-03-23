document.addEventListener('DOMContentLoaded', function () {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Please log in.');
    window.location.href = '/login';
    return;
  }

  // Fetch current profile details and populate form fields
  fetch('/api/profile', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token }
  })
    .then((res) => res.json())
    .then((user) => {
      document.getElementById('studentName').value = user.fullName || '';
      document.getElementById('studentEmail').value = user.email || '';
      // Optionally, if you have phone/institution fields, populate them here.
      // e.g., document.getElementById('studentPhone').value = user.phone || '';
    })
    .catch((err) => console.error('Error fetching profile:', err));

  /* Sidebar toggle functionality */
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
  });

  /* Profile dropdown functionality */
  const profileWrapper = document.querySelector('.profile-wrapper');
  const profileDropdown = document.querySelector('.profile-dropdown');
  profileWrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    profileDropdown.classList.remove('show');
  });

  /* Profile Settings Form Submission */
  const profileSettingsForm = document.getElementById('profileSettingsForm');
  profileSettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const fullName = document.getElementById('studentName').value;
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if ((newPassword || confirmPassword || currentPassword) && newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }

    const payload = {
      fullName: fullName
      // Add other fields if needed (e.g., phone, institution)
    };

    fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        alert('Profile settings saved.');
      })
      .catch(error => {
        console.error('Error updating profile:', error);
        alert('Error updating profile.');
      });
  });

  /* Notification Settings Form Submission */
  const notificationSettingsForm = document.getElementById('notificationSettingsForm');
  notificationSettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const notifAnnouncements = document.getElementById('notifAnnouncements').checked;
    const notifTests = document.getElementById('notifTests').checked;
    const notifAssignments = document.getElementById('notifAssignments').checked;
    const emailNotifications = document.getElementById('emailNotifications').checked;

    const payload = {
      notifAnnouncements,
      notifTests,
      notifAssignments,
      emailNotifications
    };

    // Note: The endpoint /api/notifications is not defined in main.py.
    fetch('/api/notifications', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        alert('Notification settings saved.');
      })
      .catch(error => {
        console.error('Error updating notifications:', error);
        alert('Error updating notification settings.');
      });
  });

  /* Display Settings Form Submission */
  const displaySettingsForm = document.getElementById('displaySettingsForm');
  displaySettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const theme = document.getElementById('themeSelect').value;
    const fontSize = document.getElementById('fontSizeSelect').value;

    const payload = {
      theme,
      fontSize
    };

    // Note: The endpoint /api/display-settings is not defined in main.py.
    fetch('/api/display-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        alert(`Display settings saved. Theme: ${theme}, Font Size: ${fontSize}`);
      })
      .catch(error => {
        console.error('Error updating display settings:', error);
        alert('Error updating display settings.');
      });
  });
});
