// Teacher Chatbot Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize chatbot
  initChatbot();
});

function initChatbot() {
  // Toggle the display of the chatbot widget when clicking the floating icon
  document.getElementById('chatbotIcon').addEventListener('click', function() {
    const widget = document.getElementById('chatWidget');
    widget.style.display = (widget.style.display === 'none' || widget.style.display === '') ? 'block' : 'none';
  });

  // Functionality toggle: "Ask Doubt" vs. "Navigate Site"
  const doubtActionBtn = document.getElementById('doubtActionBtn');
  const navigateActionBtn = document.getElementById('navigateActionBtn');
  let currentFunction = "doubt"; // default function is "doubt"

  // Function to update all related buttons
  function updateFunctionButtons(funcType) {
    currentFunction = funcType;
    
    if (funcType === "doubt") {
      doubtActionBtn.classList.add('active');
      navigateActionBtn.classList.remove('active');
    } else {
      navigateActionBtn.classList.add('active');
      doubtActionBtn.classList.remove('active');
    }
  }

  // Add click handlers for both sets of buttons
  doubtActionBtn.addEventListener('click', function() {
    updateFunctionButtons("doubt");
  });
  
  navigateActionBtn.addEventListener('click', function() {
    updateFunctionButtons("navigate");
  });

  // Retrieve JWT token from localStorage
  const token = localStorage.getItem('accessToken') || localStorage.getItem('access_token');

  // Handle Enter key press
  const chatInput = document.getElementById('chatInput');
  chatInput.addEventListener('keydown', function(e) {
    // Send message when Enter is pressed without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default behavior (newline)
      document.getElementById('sendButton').click();
    }
  });

  // Send button event: sends the chat query to the /chat endpoint
  document.getElementById('sendButton').addEventListener('click', async function() {
    const query = chatInput.value;
    if (!query.trim()) return;  // Do nothing if empty

    // Append user's message to the conversation display
    const conversation = document.getElementById('chatConversation');
    conversation.innerHTML += `<div class="user-message message">${query}</div>`;
    
    // Create and append loading spinner message
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'bot-message message loading';
    loadingMessage.innerHTML = '<div class="loading-spinner"></div>';
    conversation.appendChild(loadingMessage);
    conversation.scrollTop = conversation.scrollHeight;
    
    chatInput.value = '';  // Clear the input
    chatInput.focus(); // Keep focus on input field

    try {
      // POST the chat query to the /chat endpoint along with the current function
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          query: query,
          function: currentFunction,
          role: 'teacher' // Add role to differentiate teacher from student
        })
      });
      const data = await response.json();
      
      // Convert Markdown to HTML using marked.parse()
      let formattedAnswer = marked.parse(data.answer);
      
      // Remove loading message
      conversation.removeChild(loadingMessage);
      
      // Create bot message with typewriter container
      const botMessage = document.createElement('div');
      botMessage.className = 'bot-message message';
      const typewriterSpan = document.createElement('div');
      typewriterSpan.className = 'typewriter-text';
      botMessage.appendChild(typewriterSpan);
      conversation.appendChild(botMessage);
      
      // Apply typewriter effect
      let index = 0;
      let allHTML = formattedAnswer;
      typewriterSpan.innerHTML = '';
      
      function typeNextChar() {
        if (index < allHTML.length) {
          typewriterSpan.innerHTML = allHTML.substring(0, index + 1);
          index++;
          setTimeout(typeNextChar, 10);
        }
      }
      
      typeNextChar();
      conversation.scrollTop = conversation.scrollHeight;
    } catch (error) {
      console.error("Error:", error);
      // Remove loading message
      conversation.removeChild(loadingMessage);
      
      // Add error message
      const errorMessage = document.createElement('div');
      errorMessage.className = 'bot-message message';
      errorMessage.style.color = 'red';
      errorMessage.textContent = 'Sorry, I encountered an error. Please try again.';
      conversation.appendChild(errorMessage);
      conversation.scrollTop = conversation.scrollHeight;
    }
  });
  
  // Custom resize functionality
  let isResizing = false;
  let currentResizeHandle = null;
  const widget = document.getElementById('chatWidget');
  const resizeRight = document.getElementById('resizeRight');
  const resizeBottom = document.getElementById('resizeBottom');
  const resizeCorner = document.getElementById('resizeCorner');
  
  // Handle mouse down on resize handles
  resizeRight.addEventListener('mousedown', startResize);
  resizeBottom.addEventListener('mousedown', startResize);
  resizeCorner.addEventListener('mousedown', startResize);
  
  function startResize(e) {
    isResizing = true;
    currentResizeHandle = e.target;
    e.preventDefault();
  }
  
  // Handle mouse move for resizing
  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    
    const rect = widget.getBoundingClientRect();
    
    if (currentResizeHandle === resizeRight || currentResizeHandle === resizeCorner) {
      const width = e.clientX - rect.left;
      if (width >= 300) { // Minimum width
        widget.style.width = width + 'px';
      }
    }
    
    if (currentResizeHandle === resizeBottom || currentResizeHandle === resizeCorner) {
      const height = e.clientY - rect.top;
      if (height >= 400) { // Minimum height
        widget.style.height = height + 'px';
      }
    }
  });
  
  // Stop resizing on mouse up
  document.addEventListener('mouseup', function() {
    isResizing = false;
    currentResizeHandle = null;
  });
} 