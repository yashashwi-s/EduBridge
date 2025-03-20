document.addEventListener('DOMContentLoaded', function() {
  // Initialize AOS with slightly faster duration
  AOS.init({ 
    duration: 800, 
    once: true,
    easing: 'ease-out'
  });
  
  // Toggle navigation menu for mobile
  window.toggleMenu = function() {
    const navMenu = document.querySelector('.nav-menu');
    navMenu.classList.toggle('active');
  };
  
  // Initialize VANTA with reduced complexity for faster loading
  VANTA.TOPOLOGY({
    el: "#vanta-topology",
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.00,
    minWidth: 200.00,
    scale: 0.75,         // Reduced complexity
    scaleMobile: 0.5,    // Further reduced for mobile
    color: 0xedff,
    backgroundColor: 0x43,
    points: 10,          // Reduced number of points for faster loading
    maxDistance: 20.00,  // Reduced max distance for performance
    spacing: 15.00       // Increased spacing for fewer elements
  });
  
  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        // Close mobile menu if open
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
        }
        
        // Smooth scroll to the target element
        window.scrollTo({
          top: targetElement.offsetTop - 80, // Offset for header height
          behavior: 'smooth'
        });
      }
    });
  });
  
  // Add scroll-based header transparency effect
  const header = document.querySelector('header');
  window.addEventListener('scroll', function() {
    if (window.scrollY > 100) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
  
  // Add simple loading indicator that disappears once page is ready
  const body = document.body;
  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.innerHTML = '<div class="loader-spinner"></div>';
  body.appendChild(loader);
  
  window.addEventListener('load', function() {
    setTimeout(function() {
      loader.classList.add('loader-hidden');
      setTimeout(function() {
        loader.remove();
      }, 500);
    }, 500);
  });
  
  // Add hover effect to features
  const features = document.querySelectorAll('.feature');
  features.forEach(feature => {
    feature.addEventListener('mouseenter', function() {
      this.classList.add('feature-hover');
    });
    feature.addEventListener('mouseleave', function() {
      this.classList.remove('feature-hover');
    });
  });
});