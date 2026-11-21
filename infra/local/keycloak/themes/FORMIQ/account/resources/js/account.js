import { installAvatarUpload } from './avatar.js?v=2';

const { PREFERENCE_COOKIE_NAMES, isPreferenceCookieName, readBrowserCookie, readCookieConsent, readPreferenceCookie, persistPreferenceCookie, removePreferenceCookie } = globalThis.FormiqPreferenceCookies;
const root = document.documentElement;
const requestedCookie = new URL(import.meta.url).searchParams.get('cookieName');
const cookieName = isPreferenceCookieName(requestedCookie || "") ? requestedCookie : PREFERENCE_COOKIE_NAMES.theme;
const modes = ['system', 'dark', 'light'];
const read = () => readCookieConsent() === "preferences" ? readPreferenceCookie(cookieName) : undefined;
const legacy = readCookieConsent() === "preferences" ? readBrowserCookie('theme') : undefined;
let mode = modes.includes(read()) ? read() : modes.includes(legacy) ? legacy : 'system';
const media = matchMedia('(prefers-color-scheme: dark)');
const domain = new URL(import.meta.url).searchParams.get('cookieDomain') || '';
const environment = JSON.parse(document.getElementById('environment').textContent);
const requestedLocale = new URL(location.href).searchParams.get('kc_locale');
let pl = (['pl', 'en'].includes(requestedLocale) ? requestedLocale : root.lang).startsWith('pl');
const themeLabels = () => pl ? ['Systemowy', 'Ciemny', 'Jasny'] : ['System', 'Dark', 'Light'];
const toolbar = document.createElement('div');
toolbar.className = 'mod-account-preferences';
const icon = (paths) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const home = document.createElement('a');
home.id = 'mod-account-home';
const destination = new URL(environment.logoUrl || environment.referrerUrl);
destination.pathname = pl ? '/pl' : '/en';
destination.search = '';
destination.hash = '';
home.href = destination.href;
home.innerHTML = icon('<path d="m10 5-7 7 7 7M3 12h18"/>') + `<span>${pl ? 'Do aplikacji' : 'Back to app'}</span>`;
const language = document.createElement('button');
language.type = 'button';
language.id = 'mod-account-locale';
const languageUrl = new URL(location.href);
languageUrl.searchParams.set('kc_locale', pl ? 'en' : 'pl');

language.setAttribute('aria-label', pl ? 'Zmień na angielski' : 'Switch to Polish');
language.innerHTML = icon('<path d="M3 5h12M9 3v2m4 0c-1 6-4 9-10 11m2-9c1 4 4 7 8 9m1 5 4-11 4 11m-6-4h4"/>') + `<span>${pl ? 'Polski' : 'English'}</span>`;
const button = document.createElement('button');
button.type = 'button';
button.id = 'mod-account-theme';
function renderLogo() {
  const file = root.dataset.theme === 'dark' ? 'FORMIQDark.svg' : 'FORMIQ.svg';
  const source = new URL(`../img/${file}`, import.meta.url).href;
  document.querySelectorAll('#app img[src$="/FORMIQ.svg"], #app img[src$="/FORMIQDark.svg"]').forEach(logo => {
    if (logo.src !== source) logo.src = source;
  });
}
function render() {
  const dark = mode === 'dark' || (mode === 'system' && media.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.toggle('pf-v5-theme-dark', dark);
  renderLogo();
  const paths = mode === 'dark' ? '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>' : mode === 'light' ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>' : '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>';
  button.innerHTML = icon(paths) + `<span>${themeLabels()[modes.indexOf(mode)]}</span>`;
  button.setAttribute('aria-label', `${pl ? 'Motyw' : 'Theme'}: ${themeLabels()[modes.indexOf(mode)]}`);
}
function persistTheme() {
  if (readCookieConsent() !== "preferences") return;
  persistPreferenceCookie(cookieName, mode, domain);
  if (cookieName !== 'theme' && readBrowserCookie(cookieName) === mode) {
    removePreferenceCookie('theme', location.protocol === 'https:');
  }
}
button.addEventListener('click', () => {
  mode = modes[(modes.indexOf(mode) + 1) % modes.length];
  persistTheme();
  render();
});
media.addEventListener('change', render);
window.addEventListener('pageshow', () => { if (modes.includes(read())) mode = read(); render(); });
window.addEventListener('focus', () => { if (modes.includes(read())) mode = read(); render(); });
render();
toolbar.append(home, language, button);
// The native console still owns its profile form; navigation uses the current UI locale.
function hideDuplicateReturnLink() {
  if (!environment.referrerUrl) return;
  document.querySelectorAll('#app a[href]').forEach(link => {
    if (link.href === environment.referrerUrl) link.classList.add('mod-native-return');
  });
}
// React mounts and replaces the brand image after the theme script initializes.
new MutationObserver(() => {
  hideDuplicateReturnLink();
  renderLogo();
}).observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
hideDuplicateReturnLink();
renderLogo();
document.body.prepend(toolbar);
const refreshAvatar = installAvatarUpload(destination.origin, () => pl ? 'pl' : 'en');

function renderLocale(locale) {
  pl = locale === 'pl';
  root.lang = locale;
  destination.pathname = `/${locale}`;
  home.href = destination.href;
  home.querySelector('span').textContent = pl ? 'Do aplikacji' : 'Back to app';
  language.querySelector('span').textContent = pl ? 'Polski' : 'English';
  language.setAttribute('aria-label', pl ? 'Zmień na angielski' : 'Switch to Polish');
  const url = new URL(location.href);
  url.searchParams.set('kc_locale', locale);
  history.replaceState(history.state, '', url);
  render();
  refreshAvatar();
}
// Account Console's native locale selector uses this event after saving the profile.
window.addEventListener('languageChanged', event => {
  if (['pl', 'en'].includes(event.detail?.language)) renderLocale(event.detail.language);
});
language.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: pl ? 'en' : 'pl' } }));
});
function initializeLocale() {
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: pl ? 'pl' : 'en' } }));
}
if (document.readyState === 'complete') initializeLocale();
else window.addEventListener('load', initializeLocale, { once: true });
