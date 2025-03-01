document.addEventListener('DOMContentLoaded', function() {
  AOS.init({ duration: 1000, once: true });
  
  window.toggleMenu = function() {
    const navMenu = document.querySelector('.nav-menu');
    navMenu.classList.toggle('active');
  };
  
  VANTA.TOPOLOGY({
    el: "#vanta-topology",
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.00,
    minWidth: 200.00,
    scale: 1.00,
    scaleMobile: 1.00,
    color: 0xedff,
    backgroundColor: 0x43
  });
});
