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

    if (!clickedInsideSidebar && !clickedEdgeToggle && !clickedOpenTab) {
      closeMobileSidebar();
    }
  });

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
