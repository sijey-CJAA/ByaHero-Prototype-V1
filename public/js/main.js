// public/js/main.js - wiring for role selection
window.ByaHero = window.ByaHero || {};

(function(){
  const busBtn = document.getElementById('choose-bus');
  const cusBtn = document.getElementById('choose-customer');

  // ensure map module exists early
  if (window.ByaHero && window.ByaHero.createMap) {
    window.ByaHero.createMap('map');
  }

  busBtn && busBtn.addEventListener('click', () => {
    if (window.ByaHero && typeof window.ByaHero.initBus === 'function') {
      window.ByaHero.initBus();
    } else {
      console.error('initBus not available. Check that public/js/bus.js is loaded and that there are no console errors.');
      alert('Bus module not loaded. Open DevTools Console for details.');
    }
  });

  cusBtn && cusBtn.addEventListener('click', () => {
    if (window.ByaHero && typeof window.ByaHero.initCustomer === 'function') {
      window.ByaHero.initCustomer();
    } else {
      console.error('initCustomer not available. Check that public/js/customer.js is loaded and that there are no console errors.');
      alert('Customer module not loaded. Open DevTools Console for details.');
    }
  });

})();