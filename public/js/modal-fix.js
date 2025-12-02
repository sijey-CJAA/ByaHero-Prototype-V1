(function () {
  'use strict';

  // Find a Leaflet map instance used by your app.
  function findMap() {
    try {
      if (window.ByaHero && typeof window.ByaHero.getMap === 'function') return window.ByaHero.getMap();
      if (window.map && typeof window.map === 'object') return window.map;
      if (window._map && typeof window._map === 'object') return window._map;
    } catch (e) { /* ignore */ }
    return null;
  }

  function enableMapInteractions() {
    var map = findMap();
    if (!map) return;
    try {
      if (typeof map.invalidateSize === 'function') {
        // small delay so the map has been rendered/un-hidden first
        setTimeout(function () {
          map.invalidateSize();
        }, 50);
      }
      if (map.dragging && typeof map.dragging.enable === 'function') map.dragging.enable();
      if (map.scrollWheelZoom && typeof map.scrollWheelZoom.enable === 'function') map.scrollWheelZoom.enable();
      if (map.doubleClickZoom && typeof map.doubleClickZoom.enable === 'function') map.doubleClickZoom.enable();
      if (map.touchZoom && typeof map.touchZoom.enable === 'function') map.touchZoom.enable();
      var mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.style.pointerEvents = 'auto';
        // ensure the map sits above any stray overlays
        if (!mapEl.style.zIndex) mapEl.style.zIndex = '0';
      }
    } catch (e) {
      // silent fail - best effort only
      console.warn('modal-fix: enableMapInteractions failed', e);
    }
  }

  function removeAllBackdrops() {
    document.querySelectorAll('.modal-backdrop').forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function cleanupModalArtifacts() {
    try {
      removeAllBackdrops();
      // Remove classes and inline styles Bootstrap may have added to body
      document.body.classList.remove('modal-open');
      document.body.style.paddingRight = '';
      // remove any inline overflow hidden on html/body
      document.documentElement.style.overflow = '';
      // remove any visible modal 'show' class on our bus modal
      var modalEl = document.getElementById('busRegisterModal');
      if (modalEl) modalEl.classList.remove('show', 'd-block');

      // Also remove any .show and aria-hidden attributes on modal elements
      document.querySelectorAll('.modal').forEach(function (m) {
        m.classList.remove('show', 'd-block');
        m.setAttribute('aria-hidden', 'true');
      });

      // Try to remove any leftover inline backdrops
      removeAllBackdrops();

      // Re-enable map interactions
      enableMapInteractions();
    } catch (e) {
      console.warn('modal-fix cleanup failed', e);
    }
  }

  // Listen for bootstrap modal hidden event so we can always clean up
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var modalEl = document.getElementById('busRegisterModal');
      if (!modalEl) return;

      // If bootstrap is loaded, hook the hidden.bs.modal event
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        // If bootstrap was used to create the modal instance, this event will fire
        modalEl.addEventListener('hidden.bs.modal', function () {
          cleanupModalArtifacts();
        });
      }

      // Also hook form submit to proactively clean up fallback cases
      var form = document.getElementById('bus-register-form');
      if (form) {
        form.addEventListener('submit', function () {
          // small delay to allow any modal hide logic to run first
          setTimeout(cleanupModalArtifacts, 150);
        });
      }

      // If user code manually hides modal by toggling classes (fallback), ensure we cleanup after a short delay
      // Also guard against stuck backdrops: if body has .modal-open but no visible modal, remove it.
      setInterval(function () {
        var hasModalOpen = document.body.classList.contains('modal-open');
        var hasBackdrop = !!document.querySelector('.modal-backdrop');
        var anyModalShowing = !!document.querySelector('.modal.show, .modal.d-block');
        if (hasModalOpen && !anyModalShowing) {
          // stuck state: remove artifacts
          cleanupModalArtifacts();
        }
        // If there's a backdrop but it's not the right one (or orphaned), remove it
        if (!anyModalShowing && hasBackdrop) {
          removeAllBackdrops();
        }
      }, 700);

      // Also listen for a custom event if your app emits it (safe no-op otherwise)
      window.addEventListener('ByaHero:RegisteredAsBus', function () {
        setTimeout(cleanupModalArtifacts, 100);
      });
    } catch (e) {
      console.warn('modal-fix init failed', e);
    }
  });

  // Expose for manual triggering in console for debugging
  window.ByaHeroModalCleanup = cleanupModalArtifacts;
})();