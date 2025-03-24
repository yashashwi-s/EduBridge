// DOM Elements
document.addEventListener('DOMContentLoaded', function() {
  try {
  // Nav and Sidebar Elements
  const hamburgerBtn = document.getElementById('hamburger');
  const sidebar = document.querySelector('.sidebar');
  const content = document.querySelector('.content');
  const profileIcon = document.querySelector('.profile-icon');
  const profileDropdown = document.querySelector('.profile-dropdown');

  // Form Elements
  const profileSettingsForm = document.getElementById('profileSettingsForm');
  const communicationSettingsForm = document.getElementById('communicationSettingsForm');
  const displaySettingsForm = document.getElementById('displaySettingsForm');
  
  // Profile Elements
  const teacherNameInput = document.getElementById('teacherName');
  const teacherEmailInput = document.getElementById('teacherEmail');
  
  // Password Elements
  const currentPasswordInput = document.getElementById('currentPassword');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const passwordStrengthMeter = document.getElementById('strengthMeter');
  const passwordStrengthText = document.getElementById('strengthText');
  const togglePasswordBtns = document.querySelectorAll('.toggle-password');
  
  // Track original values to detect changes
  let originalName = '';
  let isNameChanged = false;
  let isPasswordChanged = false;
  
  // Auto-Responder Elements
  const autoResponderToggle = document.getElementById('autoResponder');
  const autoResponderTextGroup = document.getElementById('autoResponderTextGroup');
  
  // Theme Elements
  const themeOptions = document.querySelectorAll('input[name="theme"]');
  const fontSizeRange = document.getElementById('fontSizeRange');
  const reducedMotionToggle = document.getElementById('reducedMotion');
  const highContrastToggle = document.getElementById('highContrast');
  
  // Data & Privacy Elements
  const exportDataBtn = document.getElementById('exportDataBtn');
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  
  // Modal Elements
  const confirmationModal = document.getElementById('confirmationModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');
  const closeModalBtn = document.querySelector('.close-modal');
  
  // Toast Elements
  const successToast = document.getElementById('successToast');
  const toastMessage = document.getElementById('toastMessage');
  const toastCloseBtn = document.querySelector('.toast-close');
  
  // Chatbot Icon
  const chatbotIcon = document.querySelector('.chatbot-icon');

  // Authentication & API Utilities
  const getAuthToken = () => {
    return localStorage.getItem('access_token');
  };

  const isLoggedIn = () => {
    return !!getAuthToken();
  };

  const redirectToLogin = () => {
    window.location.href = '/login';
  };

  const apiRequest = async (url, method = 'GET', data = null) => {
    const token = getAuthToken();
    if (!token) {
      // If not logged in, show a message and redirect
      showToast('Please login to continue', 'error');
      setTimeout(redirectToLogin, 2000);
      return null;
    }

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();

      if (response.status === 401) {
        // Token expired or invalid
        showToast('Session expired. Please login again.', 'error');
        setTimeout(redirectToLogin, 2000);
        return null;
      }

      return { status: response.status, data: result };
    } catch (error) {
      console.error('API request failed:', error);
      return { status: 500, data: { msg: 'Network or server error. Please try again.' } };
    }
  };

  // ----- Sidebar Toggle Functionality -----
    if (hamburgerBtn) {
  hamburgerBtn.addEventListener('click', function() {
    sidebar.classList.toggle('collapsed');
    content.classList.toggle('expanded');
  });
    }

  // ----- Profile Dropdown Toggle -----
    if (profileIcon) {
  profileIcon.addEventListener('click', function(e) {
    e.stopPropagation();
    profileDropdown.classList.toggle('active');
  });
    }

  document.addEventListener('click', function() {
      if (profileDropdown) {
    profileDropdown.classList.remove('active');
      }
  });

  // ----- Password Visibility Toggle -----
    if (togglePasswordBtns) {
  togglePasswordBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const passwordInput = this.previousElementSibling;
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });
  });
    }

  // ----- Password Strength Meter -----
  function checkPasswordStrength() {
      if (!newPasswordInput || !passwordStrengthMeter || !passwordStrengthText) {
        return;
      }
      
    const password = newPasswordInput.value;
    let strength = 0;
    let feedback = 'Password strength';
    
    if (password.length === 0) {
      passwordStrengthMeter.style.width = '0%';
      passwordStrengthMeter.style.backgroundColor = '';
      passwordStrengthText.textContent = feedback;
      return;
    }
    
    // Length check
    if (password.length >= 8) {
      strength += 1;
    }

    // Complexity checks
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    
    // Set feedback and colors based on strength
    const percentage = (strength / 5) * 100;
    
    if (strength <= 1) {
      feedback = 'Very weak';
      passwordStrengthMeter.style.backgroundColor = '#ef476f';
    } else if (strength <= 2) {
      feedback = 'Weak';
      passwordStrengthMeter.style.backgroundColor = '#ffd166';
    } else if (strength <= 3) {
      feedback = 'Fair';
      passwordStrengthMeter.style.backgroundColor = '#06d6a0';
    } else if (strength <= 4) {
      feedback = 'Good';
      passwordStrengthMeter.style.backgroundColor = '#118ab2';
    } else {
      feedback = 'Strong';
      passwordStrengthMeter.style.backgroundColor = '#073b4c';
    }
    
    passwordStrengthMeter.style.width = `${percentage}%`;
    passwordStrengthText.textContent = feedback;
  }
 
  // ----- Track field changes -----
    if (teacherNameInput) {
  teacherNameInput.addEventListener('input', function() {
    isNameChanged = this.value.trim() !== originalName;
    updateProfileSaveButton();
  });
    }
  
    if (newPasswordInput) {
  newPasswordInput.addEventListener('input', function() {
    isPasswordChanged = this.value.trim().length > 0;
    updateProfileSaveButton();
    checkPasswordStrength();
  });
    }
  
    if (currentPasswordInput) {
  currentPasswordInput.addEventListener('input', updateProfileSaveButton);
    }
  
  function updateProfileSaveButton() {
      if (!profileSettingsForm) return;
      
    const submitBtn = profileSettingsForm.querySelector('.submit-btn');
      if (!submitBtn) return;
      
    const anyChanges = isNameChanged || isPasswordChanged;
    const passwordValid = validatePasswordFields();
    
    // If anything changed, enable the button (but validation will still happen on submit)
    if (anyChanges) {
      submitBtn.classList.add('changes-pending');
      submitBtn.disabled = false;
    } else {
      submitBtn.classList.remove('changes-pending');
      submitBtn.disabled = true;
    }
    
    // Visual feedback based on password validation
      if (isPasswordChanged && currentPasswordInput) {
      if (!passwordValid.valid) {
        currentPasswordInput.classList.add('input-required');
        const passwordLabel = document.querySelector('label[for="currentPassword"]');
          if (passwordLabel) {
        passwordLabel.classList.add('required-field');
          }
      } else {
        currentPasswordInput.classList.remove('input-required');
        const passwordLabel = document.querySelector('label[for="currentPassword"]');
          if (passwordLabel) {
        passwordLabel.classList.remove('required-field');
          }
      }
    }
  }
  
  function validatePasswordFields() {
      if (!newPasswordInput || !confirmPasswordInput || !currentPasswordInput) {
        return { valid: false, reason: 'missing_elements' };
      }
      
    const passwordChanged = newPasswordInput.value.trim().length > 0;
    const currentPasswordEntered = currentPasswordInput.value.trim().length > 0;
    const passwordsMatch = newPasswordInput.value === confirmPasswordInput.value;
    
    return {
      valid: !passwordChanged || (passwordChanged && currentPasswordEntered && passwordsMatch),
      reason: !passwordsMatch ? 'mismatch' : 
              !currentPasswordEntered ? 'current_required' : 'valid'
    };
  }

  // ----- Auto-Responder Toggle -----
    if (autoResponderToggle && autoResponderTextGroup) {
  autoResponderToggle.addEventListener('change', function() {
    if (this.checked) {
      autoResponderTextGroup.classList.add('active');
    } else {
      autoResponderTextGroup.classList.remove('active');
    }
  });
    }

    // ----- Profile Settings Form Submit -----
    if (profileSettingsForm) {
  profileSettingsForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
        // Validate form
        const validationResult = validatePasswordFields();
        
        if (isPasswordChanged && !validationResult.valid) {
          // Show error message based on validation result
          if (validationResult.reason === 'mismatch') {
            showInputError(confirmPasswordInput, 'Passwords do not match');
            confirmPasswordInput.focus();
          } else if (validationResult.reason === 'current_required') {
            showInputError(currentPasswordInput, 'Current password is required');
            currentPasswordInput.focus();
          }
          return;
        }
        
        // Gather form data
        const name = teacherNameInput ? teacherNameInput.value.trim() : '';
        const currentPassword = currentPasswordInput ? currentPasswordInput.value.trim() : '';
        const newPassword = isPasswordChanged && newPasswordInput ? newPasswordInput.value.trim() : '';
        
        // Prepare data for API
        const data = {
          current_password: currentPassword
    };
    
    if (isNameChanged) {
          data.name = name;
    }
    
    if (isPasswordChanged) {
          data.new_password = newPassword;
    }
    
    // Show loading state
        const submitBtn = this.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
        // Make actual API call to update profile in MongoDB
    try {
          const response = await apiRequest('/api/profile', 'PUT', data);
      
      if (response && response.status === 200) {
            // Update succeeded - reset state
        if (isPasswordChanged) {
          newPasswordInput.value = '';
          confirmPasswordInput.value = '';
          passwordStrengthMeter.style.width = '0%';
          passwordStrengthText.textContent = 'Password strength';
              isPasswordChanged = false;
            }
            
            if (isNameChanged) {
              originalName = name;
              isNameChanged = false;
            }
            
        currentPasswordInput.value = '';
        
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = true;
            submitBtn.classList.remove('changes-pending');
        
            showToast('Profile updated successfully in MongoDB!');
      } else {
            // Handle specific error messages from the API
            let errorMsg = 'Failed to update profile';
            
            if (response && response.data && response.data.msg) {
              errorMsg = response.data.msg;
              
              // Handle specific error types
              if (errorMsg.includes('password') || response.status === 401) {
                showInputError(currentPasswordInput, 'Incorrect password');
                currentPasswordInput.focus();
              }
            }
            
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            showToast(`Error: ${errorMsg}`, 'error');
      }
    } catch (error) {
          console.error('Profile update error:', error);
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
          showToast('Network error. Please try again.', 'error');
    }
  });
    }

    // ----- Display error message on input -----
  function showInputError(inputElement, message) {
      if (!inputElement) return;
      
      // Add error class to input
      inputElement.classList.add('input-error-highlight');
      
      // Find or create error message element
      let errorElement = inputElement.parentNode.querySelector('.input-error');
    
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'input-error';
        
        // If inside a password wrapper, append after the wrapper
        const wrapper = inputElement.closest('.password-input-wrapper');
        if (wrapper) {
          wrapper.parentNode.insertBefore(errorElement, wrapper.nextSibling);
      } else {
          inputElement.parentNode.appendChild(errorElement);
      }
    }
    
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
      // Clear error after 5 seconds or on input
    setTimeout(() => {
        if (inputElement && errorElement) {
          inputElement.classList.remove('input-error-highlight');
      errorElement.style.display = 'none';
        }
      }, 5000);
      
      inputElement.addEventListener('input', function clearError() {
        this.classList.remove('input-error-highlight');
        if (errorElement) {
          errorElement.style.display = 'none';
        }
        this.removeEventListener('input', clearError);
      });
    }

    // ----- Check password strength level -----
  function checkPasswordStrengthLevel(password) {
      if (!password) return 0;
      
    let strength = 0;
    
      // Length check
      if (password.length >= 8) strength += 1;
      if (password.length >= 12) strength += 1;

      // Character variety checks
      if (/[A-Z]/.test(password)) strength += 1;
      if (/[a-z]/.test(password)) strength += 1;
      if (/[0-9]/.test(password)) strength += 1;
      if (/[^A-Za-z0-9]/.test(password)) strength += 1;
      
      return strength;
    }

    // ----- Theme Settings -----
    // Load saved theme settings
    function loadSavedTheme() {
      const savedTheme = localStorage.getItem('theme') || 'light';
      const savedFontSize = localStorage.getItem('fontSize') || '1';
      const savedReducedMotion = localStorage.getItem('reducedMotion') === 'true';
      const savedHighContrast = localStorage.getItem('highContrast') === 'true';
      
      // Apply theme
      document.documentElement.setAttribute('data-theme', savedTheme);
      themeOptions.forEach(option => {
        option.checked = option.value === savedTheme;
      });
      
      // Apply font size
      fontSizeRange.value = savedFontSize;
      applyFontSize(savedFontSize);
      
      // Apply toggles
      if (reducedMotionToggle) reducedMotionToggle.checked = savedReducedMotion;
      if (highContrastToggle) highContrastToggle.checked = savedHighContrast;
      
      applyReducedMotion(savedReducedMotion);
      applyHighContrast(savedHighContrast);
    }
    
    // Apply theme on change
    if (themeOptions) {
      themeOptions.forEach(option => {
        option.addEventListener('change', function() {
          if (this.checked) {
            const theme = this.value;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
          }
        });
      });
    }
    
    // Apply font size on change
    if (fontSizeRange) {
      fontSizeRange.addEventListener('input', function() {
        const size = this.value;
        applyFontSize(size);
        localStorage.setItem('fontSize', size);
      });
    }
    
    function applyFontSize(size) {
      const rootSize = size === '0' ? '14px' : size === '1' ? '16px' : '18px';
      document.documentElement.style.fontSize = rootSize;
    }
    
    // Apply reduced motion on change
    if (reducedMotionToggle) {
      reducedMotionToggle.addEventListener('change', function() {
        applyReducedMotion(this.checked);
        localStorage.setItem('reducedMotion', this.checked);
      });
    }
    
    function applyReducedMotion(enabled) {
      if (enabled) {
        document.documentElement.classList.add('reduced-motion');
      } else {
        document.documentElement.classList.remove('reduced-motion');
      }
    }
    
    // Apply high contrast on change
    if (highContrastToggle) {
      highContrastToggle.addEventListener('change', function() {
        applyHighContrast(this.checked);
        localStorage.setItem('highContrast', this.checked);
      });
    }
    
    function applyHighContrast(enabled) {
      if (enabled) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
  }

  // Communication Settings Form
    if (communicationSettingsForm) {
      communicationSettingsForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Gather form data
    const defaultEmail = document.getElementById('defaultReplyEmail').value;
    const signature = document.getElementById('emailSignature').value;
    const autoResponder = document.getElementById('autoResponder').checked;
    const autoResponderText = document.getElementById('autoResponderText').value;
    
        // Prepare data for API
        const data = {
          default_reply_email: defaultEmail,
          email_signature: signature,
          auto_responder_enabled: autoResponder,
          auto_responder_text: autoResponderText
        };
        
        // Show loading state
    const submitBtn = this.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
        try {
          // Actual API call to update communication settings
          const response = await apiRequest('/api/communication-settings', 'PUT', data);
          
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
          
          if (response && response.status === 200) {
      showToast('Communication settings updated successfully!');
          } else {
            let errorMsg = 'Failed to update communication settings';
            if (response && response.data && response.data.msg) {
              errorMsg = response.data.msg;
            }
            showToast(`Error: ${errorMsg}`, 'error');
          }
        } catch (error) {
          console.error('Communication settings update error:', error);
          submitBtn.innerHTML = originalText;
          submitBtn.disabled = false;
          showToast('Network error. Please try again.', 'error');
        }
      });
    }

  // Display Settings Form
    if (displaySettingsForm) {
  displaySettingsForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Display settings are saved automatically, so just show confirmation
    showToast('Display settings updated successfully!');
  });
    }

  // ----- Data Export and Account Deletion -----
    if (exportDataBtn) {
  exportDataBtn.addEventListener('click', function() {
    showModal(
      'Export Account Data',
      'This will export all your personal data in a downloadable format. The process may take a few minutes. Continue?',
      'Export Data',
          async function() {
        hideModal();
            
            try {
              const response = await apiRequest('/api/export-data', 'POST');
              
              if (response && response.status === 200) {
        showToast('Data export started. You will receive an email with your data soon.');
              } else {
                let errorMsg = 'Failed to start data export';
                if (response && response.data && response.data.msg) {
                  errorMsg = response.data.msg;
                }
                showToast(`Error: ${errorMsg}`, 'error');
              }
            } catch (error) {
              console.error('Data export error:', error);
              showToast('Network error. Please try again.', 'error');
            }
      }
    );
  });
    }
  
    if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener('click', function() {
    showModal(
      'Delete Account',
      'Warning: This action is irreversible. All your data, including classrooms and assignments, will be permanently deleted. Continue?',
      'Delete Account',
          async function() {
        hideModal();
            
            try {
              const response = await apiRequest('/api/delete-account', 'DELETE');
              
              if (response && response.status === 200) {
        showToast('Account scheduled for deletion. You will be logged out in a few seconds.');
                // Clear local storage and log the user out
        setTimeout(() => {
                  localStorage.removeItem('access_token');
          window.location.href = '/login';
        }, 3000);
              } else {
                let errorMsg = 'Failed to delete account';
                if (response && response.data && response.data.msg) {
                  errorMsg = response.data.msg;
                }
                showToast(`Error: ${errorMsg}`, 'error');
              }
            } catch (error) {
              console.error('Account deletion error:', error);
              showToast('Network error. Please try again.', 'error');
            }
      }
    );
  });
    }

  // ----- Modal Functions -----
  function showModal(title, content, confirmText, confirmCallback) {
      if (!modalTitle || !modalBody || !modalConfirmBtn || !confirmationModal) {
        console.error('Modal elements not found');
        return;
      }
      
    modalTitle.textContent = title;
    modalBody.textContent = content;
    modalConfirmBtn.textContent = confirmText;
    modalConfirmBtn.onclick = confirmCallback;
    confirmationModal.classList.add('active');
  }
  
  function hideModal() {
      if (confirmationModal) {
    confirmationModal.classList.remove('active');
      }
  }
  
    if (modalCancelBtn) {
  modalCancelBtn.addEventListener('click', hideModal);
    }
    
    if (closeModalBtn) {
  closeModalBtn.addEventListener('click', hideModal);
    }
  
  // Close modal when clicking outside
    if (confirmationModal) {
  confirmationModal.addEventListener('click', function(e) {
    if (e.target === this) {
      hideModal();
    }
  });
    }

  // ----- Toast Notification Functions -----
  function showToast(message, type = 'success') {
      if (!successToast || !toastMessage) {
        console.error('Toast elements not found');
        return;
      }
      
    toastMessage.textContent = message;
    
    // Update toast icon based on type
    const toastIcon = successToast.querySelector('.toast-icon');
      if (toastIcon) {
    toastIcon.className = 'toast-icon';
    toastIcon.classList.add(type);
    
    // Update icon inside
    const iconEl = toastIcon.querySelector('i');
        if (iconEl) {
    if (type === 'success') {
      iconEl.className = 'fas fa-check-circle';
    } else if (type === 'error') {
      iconEl.className = 'fas fa-times-circle';
    } else if (type === 'info') {
      iconEl.className = 'fas fa-info-circle';
          }
        }
    }
    
    // Show the toast
    successToast.classList.add('active');
    
    // Hide toast after 5 seconds
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      successToast.classList.remove('active');
    }, 5000);
  }
  
    if (toastCloseBtn) {
  toastCloseBtn.addEventListener('click', function() {
    successToast.classList.remove('active');
  });
    }

  // ----- Chatbot Functionality -----
    if (chatbotIcon) {
  chatbotIcon.addEventListener('click', function() {
    // Open chatbot panel or redirect to chat page
    window.location.href = '#chatbot';
  });
    }

  // ----- Page Load -----
    // Load theme settings
    loadSavedTheme();
    
  // Fetch and populate profile data
  fetchProfileData();

  async function fetchProfileData() {
    if (!isLoggedIn()) {
      showToast('Please login to view your profile', 'info');
      setTimeout(redirectToLogin, 2000);
      return;
    }
    
    try {
      // Show loading state
      const loadingElement = document.createElement('div');
      loadingElement.className = 'loading-overlay';
      loadingElement.innerHTML = '<div class="spinner"><i class="fas fa-spinner fa-spin"></i></div>';
      document.body.appendChild(loadingElement);
      
        // Fetch profile data from API
        const response = await apiRequest('/api/profile', 'GET');
      
      // Remove loading element
      document.body.removeChild(loadingElement);
      
      if (response && response.status === 200) {
        const userData = response.data;
        
        // Populate profile form with real data
          if (teacherNameInput) teacherNameInput.value = userData.name || userData.fullName || '';
          if (teacherEmailInput) teacherEmailInput.value = userData.email || '';
        
        // Store original values for change detection
          originalName = userData.name || userData.fullName || '';
          
          // Populate communication form
          const defaultReplyEmailInput = document.getElementById('defaultReplyEmail');
          const emailSignatureInput = document.getElementById('emailSignature');
          
          if (defaultReplyEmailInput) defaultReplyEmailInput.value = userData.email || '';
          if (emailSignatureInput) {
            const signature = userData.email_signature || 
              `${userData.name || userData.fullName || 'Teacher'}\n${userData.department || 'Department'}\n${userData.institution || 'School'}`;
            emailSignatureInput.value = signature;
          }
          
          // Set auto-responder settings if they exist
          const autoResponderEnabled = userData.auto_responder_enabled || false;
          if (autoResponderToggle) autoResponderToggle.checked = autoResponderEnabled;
          
          const autoResponderTextInput = document.getElementById('autoResponderText');
          if (autoResponderTextInput) {
            autoResponderTextInput.value = userData.auto_responder_text || 
              'Thank you for your message. I am currently unavailable and will respond to your email within 24-48 hours during school days.';
          }
        
        // Trigger auto-responder text visibility
          if (autoResponderEnabled && autoResponderTextGroup) {
          autoResponderTextGroup.classList.add('active');
        }
      } else {
        // Handle error
        showToast('Failed to load profile data. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      showToast('An error occurred while loading your profile.', 'error');
    }
    
    // Initial button state
    updateProfileSaveButton();
  }
  } catch (criticalError) {
    console.error('Critical initialization error:', criticalError);
    
    // Last resort error handler
    try {
      // Force light theme
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.fontSize = '16px';
      
      // Show emergency recovery button
      const recoveryBtn = document.getElementById('emergencyRecovery');
      if (recoveryBtn) {
        recoveryBtn.style.display = 'block';
      }
      
      // Display a user-friendly error
      const contentEl = document.querySelector('.content');
      if (contentEl) {
        contentEl.innerHTML = `
          <div style="padding: 20px; background: #fff; color: #333; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
            <h2 style="color: #ef476f;">Something went wrong</h2>
            <p>We encountered an error while loading your settings. Please try reloading the page.</p>
            <button onclick="window.location.reload()" style="background: #4361ee; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-top: 15px;">Reload Page</button>
          </div>
        `;
      }
    } catch (e) {
      // If all else fails, redirect
      window.location.href = '/teacher_dashboard';
    }
  }
}); 