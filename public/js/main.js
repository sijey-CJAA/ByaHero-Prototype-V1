// public/js/main.js - wiring for role selection / default customer flow
window.ByaHero = window.ByaHero || {};

(function(){
  const busBtn = document.getElementById('choose-bus');
  const cusBtn = document.getElementById('choose-customer');

  // ensure map module exists early
  if (window.ByaHero && window.ByaHero.createMap) {
    window.ByaHero.createMap('map');
  }

  // By default: open as Customer so users immediately see buses on route
  function activateCustomerView() {
    // visually mark button (if present)
    if (cusBtn) {
      cusBtn.classList.remove('text-white');
      cusBtn.classList.add('text-success');
    }
    if (typeof window.ByaHero.initCustomer === 'function') {
      window.ByaHero.initCustomer();
    } else {
      console.warn('initCustomer not available - customer UI may not be initialized.');
    }
    // show info box if customer module uses it
    const info = document.getElementById('info');
    if (info) info.style.display = '';
    const title = document.getElementById('mode-title');
    if (title) title.querySelector('strong').textContent = 'Customer view: Live buses';
  }

  // set up the bus registration flow (modal)
  function openBusRegisterModal() {
    // Use Bootstrap modal if available
    const modalEl = document.getElementById('busRegisterModal');
    if (!modalEl) {
      // fallback: call initBus directly
      if (typeof window.ByaHero.initBus === 'function') {
        window.ByaHero.initBus();
      } else {
        alert('Bus module not loaded. Open DevTools Console for details.');
      }
      return;
    }
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }

  // Attempt to register a bus using available bus API after modal submit
  async function handleBusRegisterSubmit(e) {
    e.preventDefault();
    const nameEl = document.getElementById('bus-name');
    const routeEl = document.getElementById('bus-route');
    const name = nameEl ? nameEl.value.trim() : '';
    const route = routeEl ? routeEl.value.trim() : '';

    // prefer to call an explicit register function if bus.js provides one
    try {
      if (typeof window.ByaHero.initBus === 'function') {
        // initialize bus UI/logic
        window.ByaHero.initBus();
      }

      // try several common register function names (non-destructive)
      if (typeof window.ByaHero.registerBus === 'function') {
        window.ByaHero.registerBus({ name, route });
      } else if (typeof window.ByaHero.register === 'function') {
        window.ByaHero.register({ name, route, role: 'bus' });
      } else if (typeof window.ByaHero.startBus === 'function') {
        window.ByaHero.startBus(name, route);
      } else {
        // If no explicit register function exists, simply log and close modal.
        console.warn('No explicit register function found on ByaHero. initBus() was called if available.');
        // Optionally, if bus.js expects geolocation to start sending positions, inform user
        alert('Bus module initialized. If automatic location sharing is implemented it will start now.');
      }
    } catch (err) {
      console.error('Error during bus registration:', err);
      alert('Failed to register bus — see console for details.');
    } finally {
      // close the modal
      const modalEl = document.getElementById('busRegisterModal');
      if (modalEl) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.hide();
      }
    }
  }

  // Wire up UI event listeners
  if (busBtn) {
    busBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      openBusRegisterModal();
    });
  }

  if (cusBtn) {
    cusBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      activateCustomerView();
    });
  }

  const form = document.getElementById('bus-register-form');
  if (form) form.addEventListener('submit', handleBusRegisterSubmit);

  // Activate customer view automatically on page load
  activateCustomerView();

})();