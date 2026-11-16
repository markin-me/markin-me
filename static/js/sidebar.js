(function () {
  const sidebar = document.getElementById('app-sidebar');
  const edgeToggle = document.getElementById('sidebar-edge-toggle');
  const openTab = document.getElementById('sidebar-open-tab');

  if (!sidebar || !edgeToggle) return;

  // overlay (из layout)
  let overlay = document.getElementById('sidebarOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }

  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  function applyCollapsedFromStorage() {
    const saved = localStorage.getItem('sidebar:collapsed');
    const collapsed = saved === '1';

    document.documentElement.setAttribute('data-sidebar-collapsed', collapsed ? '1' : '0');
    // класс не обязателен для сетки, но полезен для внутренних анимаций
    requestAnimationFrame(() => {
      sidebar.classList.toggle('is-collapsed', collapsed);
      edgeToggle.setAttribute('aria-label', collapsed ? 'Открыть боковую панель' : 'Закрыть боковую панель');
    });
  }

  applyCollapsedFromStorage();
  if (isMobile()) {
    requestAnimationFrame(() => {
      closeMobileSidebar();
    });
  }

  function openMobileSidebar() {
    if (!isMobile()) return;
    requestAnimationFrame(() => {
      sidebar.classList.add('is-open');
      overlay.classList.add('is-active');
      document.body.classList.add('sidebar-open');
      document.getElementById('adminMobileMenuBtn')?.setAttribute('aria-expanded', 'true');
      resetSidebarGesture();
    });
  }

  window.__adminSidebarApi = {
    open: openMobileSidebar,
    close: closeMobileSidebar,
  };

  function closeMobileSidebar() {
    requestAnimationFrame(() => {
      sidebar.classList.remove('is-open');
      overlay.classList.remove('is-active');
      document.body.classList.remove('sidebar-open');
      document.getElementById('adminMobileMenuBtn')?.setAttribute('aria-expanded', 'false');
      resetSidebarGesture();
    });
  }

  edgeToggle.addEventListener('click', (e) => {
    e.stopPropagation();

    if (isMobile()) {
      if (sidebar.classList.contains('is-open')) closeMobileSidebar();
      return;
    }

    const willCollapse = !document.documentElement.getAttribute('data-sidebar-collapsed') ||
      document.documentElement.getAttribute('data-sidebar-collapsed') !== '1';

    requestAnimationFrame(() => {
      document.documentElement.setAttribute('data-sidebar-collapsed', willCollapse ? '1' : '0');
      localStorage.setItem('sidebar:collapsed', willCollapse ? '1' : '0');
      sidebar.classList.toggle('is-collapsed', willCollapse);
      edgeToggle.setAttribute('aria-label', willCollapse ? 'Открыть боковую панель' : 'Закрыть боковую панель');
    });
  });

  if (openTab) {
    openTab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMobile() && !sidebar.classList.contains('is-open')) openMobileSidebar();
    });
  }

  overlay.addEventListener('click', () => {
    if (isMobile()) closeMobileSidebar();
  });

  document.addEventListener('click', (e) => {
    if (!isMobile()) return;
    if (!sidebar.classList.contains('is-open')) return;

    const target = e.target;
    const clickedInsideSidebar = sidebar.contains(target);
    const clickedEdgeToggle = edgeToggle && edgeToggle.contains(target);
    const clickedOpenTab = openTab && openTab.contains(target);
    const clickedMenuButton = target.closest('#adminMobileMenuBtn');

    if (!clickedInsideSidebar && !clickedEdgeToggle && !clickedOpenTab && !clickedMenuButton) {
      closeMobileSidebar();
    }
  }, true);

  let sidebarGesture = null;
  let sidebarFrame = null;
  function resetSidebarGesture() {
    if (sidebarFrame !== null) cancelAnimationFrame(sidebarFrame);
    sidebarFrame = null;
    sidebarGesture = null;
    sidebar.classList.remove('is-dragging');
    overlay.classList.remove('is-dragging');
    sidebar.style.removeProperty('--sidebar-drag-x');
    overlay.style.removeProperty('--sidebar-drag-opacity');
    document.body.classList.remove('sidebar-dragging');
  }
  function paintSidebarGesture(gesture) {
    sidebar.style.setProperty('--sidebar-drag-x', gesture.offset + 'px');
    overlay.style.setProperty('--sidebar-drag-opacity', String(1 + gesture.offset / gesture.distance));
  }
  function finishSidebarGesture(opened) {
    if (sidebarFrame !== null) { cancelAnimationFrame(sidebarFrame); sidebarFrame = null; }
    if (sidebarGesture?.dragging) paintSidebarGesture(sidebarGesture);
    if (opened) openMobileSidebar();
    else closeMobileSidebar();
  }
  document.addEventListener('touchstart', (event) => {
    resetSidebarGesture();
    if (!isMobile() || event.touches.length !== 1) return;
    if (document.body.classList.contains('modal-open') || document.body.classList.contains('sheet-open')) return;
    const touch = event.touches[0];
    const opened = sidebar.classList.contains('is-open');
    if (!opened && (touch.clientX > 28 || window.__adminMobilePages?.canGoBack?.())) return;
    if (opened && !sidebar.contains(event.target)) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    sidebarGesture = { x: touch.clientX, y: touch.clientY, id: touch.identifier, opened, time: event.timeStamp };
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', (event) => {
    const gesture = sidebarGesture;
    if (!gesture) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== gesture.id) { finishSidebarGesture(gesture.opened); return; }
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { resetSidebarGesture(); return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      if ((gesture.opened ? dx >= 0 : dx <= 0) || !event.cancelable) { resetSidebarGesture(); return; }
      event.preventDefault();
      gesture.distance = sidebar.getBoundingClientRect().width + 24;
      gesture.dragging = true;
      sidebar.classList.add('is-dragging');
      overlay.classList.add('is-dragging');
      document.body.classList.add('sidebar-dragging');
    } else if (!event.cancelable) { finishSidebarGesture(gesture.opened); return; }
    else event.preventDefault();
    gesture.offset = Math.max(-gesture.distance, Math.min(0, (gesture.opened ? 0 : -gesture.distance) + dx));
    if (sidebarFrame === null) sidebarFrame = requestAnimationFrame(() => {
      sidebarFrame = null;
      if (sidebarGesture === gesture) paintSidebarGesture(gesture);
    });
  }, { capture: true, passive: false });

  document.addEventListener('touchend', (event) => {
    const gesture = sidebarGesture;
    if (!gesture?.dragging) { resetSidebarGesture(); return; }
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture.id);
    if (!touch) { finishSidebarGesture(gesture.opened); return; }
    if (event.cancelable) event.preventDefault();
    const dx = touch.clientX - gesture.x;
    gesture.offset = Math.max(-gesture.distance, Math.min(0, (gesture.opened ? 0 : -gesture.distance) + dx));
    const distance = Math.max(0, gesture.opened ? -dx : dx);
    const speed = distance / Math.max(1, event.timeStamp - gesture.time);
    const changed = distance >= Math.min(80, gesture.distance * 0.25) || (distance >= 32 && speed >= 0.45);
    finishSidebarGesture(changed ? !gesture.opened : gesture.opened);
  }, { capture: true, passive: false });

  document.addEventListener('touchcancel', () => {
    if (sidebarGesture?.dragging) finishSidebarGesture(sidebarGesture.opened);
    else resetSidebarGesture();
  }, { capture: true, passive: true });
  window.addEventListener('pagehide', resetSidebarGesture);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile() && sidebar.classList.contains('is-open')) {
      closeMobileSidebar();
    }
  });

  window.addEventListener('resize', () => {
    if (isMobile()) {
      closeMobileSidebar();
      return;
    }

    if (!isMobile()) {
      closeMobileSidebar();
      applyCollapsedFromStorage();
    }
  });

  window.addEventListener('pageshow', () => {
    if (isMobile()) {
      closeMobileSidebar();
    }
  });
})();
