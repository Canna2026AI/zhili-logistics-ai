export async function registerPdaServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const explicitDevelopmentPwa =
    import.meta.env.DEV && new URLSearchParams(location.search).get('mock') === '1';
  if (!import.meta.env.PROD && !explicitDevelopmentPwa) return;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (error) {
    console.error(
      'PDA service worker registration failed; IndexedDB data remains untouched.',
      error
    );
  }
}
