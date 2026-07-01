/* Theme controller — dark default, light/dark toggle persisted to localStorage.
   Loaded early (before paint) to avoid a flash of the wrong theme. */
(function () {
  const KEY = 'esa:theme';
  const root = document.documentElement;

  function preferred() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) { /* ignore */ }
    // Default to dark per design spec (fall back to OS only if it prefers light explicitly).
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (_) { /* ignore */ }
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
    // Let theme-aware components (e.g. charts) restyle themselves.
    try { window.dispatchEvent(new CustomEvent('esa:themechange', { detail: { theme } })); } catch (_) {}
  }

  // Apply immediately (element may already exist from inline call).
  apply(preferred());

  // Expose a global toggler and wire the button once the DOM is ready.
  window.ESATheme = {
    toggle() {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      apply(next);
    },
    set: apply,
    get() { return root.getAttribute('data-theme'); },
  };

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme') || preferred());
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.addEventListener('click', window.ESATheme.toggle);
  });
})();
