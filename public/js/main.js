// public/js/main.js - wiring for role selection / default customer flow
// Updated: show bus-mode controls after registration or when role === 'bus'
window.ByaHero = window.ByaHero || {};

(function(){
  const busBtn = document.getElementById('choose-bus');
  const cusBtn = document.getElementById('choose-customer');

  // Helper to set navbar styling based on role
  function setNavbarRole(role) {
    if (role === 'bus') {
      if (busBtn) {
        busBtn.classList.remove('btn-outline-light');
        busBtn.classList.add('btn-dark');
        busBtn.textContent = 'You are a Bus';
        busBtn.disabled = true;
      }
      if (cusBtn) {
        cusBtn.classList.remove('text-success');
        cusBtn.classList.add('text-white');
      }
    } else {
      // default to customer look
      if (cusBtn) {
        cusBtn.classList.remove('text-white');
        cusBtn.classList.add('text-success');
      }
      if (busBtn) {
        busBtn.classList.remove('btn-dark');
        busBtn.classList.add('btn-outline-light');
        busBtn.textContent = 'I am a Bus';
        busBtn.disabled = false;
      }
    }
  }

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

    try {
      // Prefer the new registerAndStart API if available (registers and starts geolocation immediately)
      if (typeof window.ByaHero.registerAndStart === 'function') {
        window.ByaHero.registerAndStart({ name, route });
        // mark navbar and behavior as bus
        sessionStorage.setItem('byahero_role', 'bus');
        setNavbarRole('bus');
        // render bus-mode controls (compact)
        if (typeof window.ByaHero.showBusModeControls === 'function') {
          // small timeout to let register/start settle
          setTimeout(() => window.ByaHero.showBusModeControls(), 200);
        }
      } else if (typeof window.ByaHero.registerBus === 'function') {
        window.ByaHero.registerBus({ name, route });
        sessionStorage.setItem('byahero_role', 'bus');
        setNavbarRole('bus');
      } else if (typeof window.ByaHero.register === 'function') {
        window.ByaHero.register({ name, route, role: 'bus' });
        sessionStorage.setItem('byahero_role', 'bus');
        setNavbarRole('bus');
      } else if (typeof window.ByaHero.startBus === 'function') {
        window.ByaHero.startBus(name, route);
        sessionStorage.setItem('byahero_role', 'bus');
        setNavbarRole('bus');
      } else {
        // Fallback: initialize the in-page bus UI (older behavior)
        if (typeof window.ByaHero.initBus === 'function') {
          window.ByaHero.initBus();
          // If initBus renders inputs, populate them (best-effort)
          const n = document.getElementById('bus-name');
          const r = document.getElementById('bus-route');
          if (n) n.value = name;
          if (r && route) {
            try { r.value = route; } catch (err) { /* ignore */ }
          }
          // mark navbar as bus and show bus-mode controls (if provided)
          sessionStorage.setItem('byahero_role', 'bus');
          setNavbarRole('bus');
          if (typeof window.ByaHero.showBusModeControls === 'function') {
            setTimeout(() => window.ByaHero.showBusModeControls(), 200);
          }
        } else {
          console.warn('No explicit register function found on ByaHero. initBus() was called if available.');
          alert('Bus module initialized. If automatic location sharing is implemented it will start now.');
        }
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
      // If already registered as a bus, prevent switching to customer without explicit logout
      const role = sessionStorage.getItem('byahero_role');
      if (role === 'bus') {
        alert('You are currently registered as a bus. To view as customer, please log out from bus mode first (clear role).');
        return;
      }
      activateCustomerView();
    });
  }

  const form = document.getElementById('bus-register-form');
  if (form) form.addEventListener('submit', handleBusRegisterSubmit);

  // Respect persisted role (if any)
  const persistedRole = sessionStorage.getItem('byahero_role');
  setNavbarRole(persistedRole);

  // Activate customer view automatically on page load unless role === 'bus'
  if (persistedRole !== 'bus') {
    activateCustomerView();
  } else {
    // If role is bus, restore badge info and show in-place bus controls (without re-registering)
    const savedName = sessionStorage.getItem('byahero_name');
    const savedRoute = sessionStorage.getItem('byahero_route');
    if (savedName || savedRoute) {
      exports.upsertBadge && exports.upsertBadge('me', `You: ${savedName || 'Bus'}${savedRoute ? ' ('+savedRoute+')' : ''}`);
    }
    // show compact bus-mode controls (follow toggle and seat status)
    if (typeof window.ByaHero.showBusModeControls === 'function') {
      setTimeout(() => window.ByaHero.showBusModeControls(), 150);
    }
    // NOTE: If you want to auto-re-register (start geolocation) on reload, we can call registerAndStart with savedName/savedRoute here.
  }

})();