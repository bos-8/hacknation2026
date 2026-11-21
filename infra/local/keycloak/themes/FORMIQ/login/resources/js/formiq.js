(() => {
  const { PREFERENCE_COOKIE_NAMES, isPreferenceCookieName, readBrowserCookie, readPreferenceCookie, persistPreferenceCookie, removePreferenceCookie } = globalThis.FormiqPreferenceCookies;
  const requestedCookie = new URL(document.currentScript.src).searchParams.get('cookieName');
  const cookieName = isPreferenceCookieName(requestedCookie || "") ? requestedCookie : PREFERENCE_COOKIE_NAMES.theme;
  const modes = ['system', 'dark', 'light'];
  const shared = readPreferenceCookie(cookieName);
  const requestedTheme = new URL(location.href).searchParams.get('formiq_theme');
  const stored = modes.includes(requestedTheme) ? requestedTheme : modes.includes(shared) ? shared : readBrowserCookie('theme');
  let mode = modes.includes(stored) ? stored : 'system';
  if (modes.includes(requestedTheme)) {
    const current = new URL(location.href);
    current.searchParams.delete('formiq_theme');
    window.history.replaceState(window.history.state, '', current);
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const icons = {
    system: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
    dark: '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/><path d="M18 2v4m-2-2h4"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  };
  let refreshTooltip = () => {};

  function render() {
    document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.themePreference = mode;
    const button = document.getElementById('mod-theme');
    if (!button) return;
    button.hidden = false;
    button.querySelector('.mod-theme-icon').innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[mode]}</svg>`;
    button.querySelector('.mod-theme-label').textContent = button.dataset[mode];
    const next = modes[(modes.indexOf(mode) + 1) % modes.length];
    button.dataset.tooltip = `${button.dataset.label}: ${button.dataset[next]}`;
    button.setAttribute('aria-label', `${button.dataset.label}: ${button.dataset[mode]} → ${button.dataset[next]}`);
    refreshTooltip();
  }

  render();
  media.addEventListener('change', render);
  document.addEventListener('DOMContentLoaded', () => {
    const registrationForm = document.getElementById('kc-register-form');
    const requiredFields = document.querySelector('.login-pf-header div.subtitle');
    if (registrationForm && requiredFields) {
      requiredFields.className = 'mod-required-fields';
      registrationForm.append(requiredFields);
    }
    function persistTheme() {
      persistPreferenceCookie(cookieName, mode, document.querySelector('.mod-footer')?.dataset.preferenceCookieDomain || '');
      if (cookieName !== 'theme' && readBrowserCookie(cookieName) === mode) {
        removePreferenceCookie('theme', location.protocol === 'https:');
      }
    }
    persistTheme();
    render();
    const tooltip = document.createElement('div');
    tooltip.id = 'mod-tooltip';
    tooltip.className = 'mod-tooltip';
    tooltip.role = 'tooltip';
    tooltip.hidden = true;
    document.body.append(tooltip);
    let active = null;
    let closeTimer;
    function hideTooltip() {
      clearTimeout(closeTimer);
      active?.removeAttribute('aria-describedby');
      active = null;
      tooltip.hidden = true;
    }
    refreshTooltip = () => {
      if (!active) return;
      tooltip.textContent = active.dataset.tooltip;
      tooltip.lang = active.dataset.tooltipLang || document.documentElement.lang;
      const anchor = active.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { hideTooltip(); return; }
      const bounds = tooltip.getBoundingClientRect();
      const above = anchor.top - bounds.height - 2;
      tooltip.style.top = `${Math.max(8, Math.min(above >= 8 ? above : anchor.bottom + 2, window.innerHeight - bounds.height - 8))}px`;
      tooltip.style.left = `${Math.max(8, Math.min(anchor.left + (anchor.width - bounds.width) / 2, window.innerWidth - bounds.width - 8))}px`;
    };
    function showTooltip(control) {
      hideTooltip();
      active = control;
      control.setAttribute('aria-describedby', tooltip.id);
      tooltip.hidden = false;
      refreshTooltip();
    }
    function scheduleHide() { closeTimer = setTimeout(hideTooltip, 120); }
    document.querySelectorAll('[data-tooltip]').forEach((control) => {
      control.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') showTooltip(control); });
      control.addEventListener('pointerleave', () => { if (!control.matches(':focus-visible')) scheduleHide(); });
      control.addEventListener('focus', () => showTooltip(control));
      control.addEventListener('blur', hideTooltip);
    });
    tooltip.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    tooltip.addEventListener('pointerleave', scheduleHide);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
    window.addEventListener('resize', refreshTooltip);
    document.addEventListener('scroll', refreshTooltip, true);
    const footer = document.querySelector('.mod-footer');
    if (footer?.dataset.restartUrl) {
      document.querySelectorAll('#kc-form-login, #kc-register-form').forEach((form) => {
        form.dataset.expired = 'true';
        form.addEventListener('submit', (event) => event.preventDefault());
        form.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = true; });
        const submit = form.querySelector('[type="submit"]');
        if (submit) {
          const restart = document.createElement('a');
          restart.id = 'mod-restart-login';
          restart.className = submit.className;
          restart.href = footer.dataset.restartUrl;
          restart.textContent = footer.dataset.restartLabel;
          submit.replaceWith(restart);
        }
      });
    }
    // Keep the original submit control (and its name/value) in the native form submission.
    document.querySelectorAll('input[type="submit"], button[type="submit"]').forEach((button) => {
      const wrapper = document.createElement('span');
      wrapper.className = 'mod-submit';
      button.before(wrapper);
      wrapper.append(button);
      const spinner = document.createElement('span');
      spinner.className = 'mod-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      wrapper.append(spinner);
      const status = document.createElement('span');
      status.className = 'mod-submit-status';
      status.setAttribute('role', 'status');
      wrapper.append(status);
    });
    const submitting = new WeakSet();
    function setLoading(form, busy) {
      if (busy) form.setAttribute('aria-busy', 'true');
      else form.removeAttribute('aria-busy');
      form.querySelectorAll('.mod-submit').forEach((wrapper) => wrapper.classList.toggle('mod-loading', busy));
      form.querySelectorAll('.mod-submit-status').forEach((status) => { status.textContent = busy ? footer?.dataset.pendingLabel || '' : ''; });
    }
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        if (submitting.has(form)) { event.preventDefault(); return; }
        if (event.defaultPrevented) return;
        submitting.add(form);
        setLoading(form, true);
        queueMicrotask(() => {
          if (event.defaultPrevented) { submitting.delete(form); setLoading(form, false); }
        });
      });
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      const shared = readPreferenceCookie(cookieName);
      if (modes.includes(shared)) { mode = shared; render(); }
      document.querySelectorAll('form').forEach((form) => { if (submitting.has(form)) { submitting.delete(form); setLoading(form, false); } });
      document.querySelectorAll('.mod-loading').forEach((element) => element.classList.remove('mod-loading'));
      document.querySelectorAll('.mod-submit-status').forEach((status) => { status.textContent = ''; });
      document.querySelectorAll('.mod-submit input, .mod-submit button').forEach((button) => { button.disabled = false; });
    });
    const locale = document.getElementById('mod-locale');
    if (locale) {
      let hovered = false;
      function renderLocale() {
        const code = hovered || locale.matches(':focus-visible') ? locale.dataset.next : locale.dataset.current;
        const label = locale.querySelector('.mod-locale-label');
        locale.querySelector('img').src = `${locale.dataset.resources}/img/flag-${code}.svg`;
        label.textContent = code === 'pl' ? 'Polski' : 'English';
        label.lang = code;
      }
      locale.addEventListener('pointerenter', (event) => { hovered = event.pointerType === 'mouse'; renderLocale(); });
      locale.addEventListener('pointerleave', () => { hovered = false; renderLocale(); });
      locale.addEventListener('focus', renderLocale);
      locale.addEventListener('blur', renderLocale);
    }
    document.getElementById('mod-theme')?.addEventListener('click', () => {
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      persistTheme();
      render();
    });
  });
})();
