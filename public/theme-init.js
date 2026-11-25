(function () {
  try {
    var saved = localStorage.getItem('vaha-theme');
    var mode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    var isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0a0a0a' : '#ffffff');
  } catch (e) {
    // ignore storage errors
  }
})();
