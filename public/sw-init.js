if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  document.documentElement.classList.add('pwa-mode');
}
