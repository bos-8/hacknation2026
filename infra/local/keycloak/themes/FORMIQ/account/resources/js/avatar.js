/** Native profile form owns the picture attribute and its Save/Cancel semantics. */
export function installAvatarUpload(appOrigin, locale) {
  const messages = {
    pl: { choose: 'Wgraj zdjęcie', remove: 'Usuń zdjęcie', hint: 'PNG, JPG lub WebP, maks. 2 MB. Zdjęcie zostanie przycięte do kwadratu.', busy: 'Przesyłanie…', ready: 'Zmiana gotowa. Kliknij Zapisz, aby zaktualizować profil.', invalid: 'Wybierz poprawny plik PNG, JPG lub WebP do 2 MB.', error: 'Nie udało się przesłać zdjęcia. Spróbuj ponownie.', session: 'Zaloguj się ponownie w aplikacji FORMIQ, a następnie wróć do panelu konta.', label: 'Zdjęcie profilowe' },
    en: { choose: 'Upload picture', remove: 'Remove picture', hint: 'PNG, JPG or WebP, up to 2 MB. The picture will be cropped to a square.', busy: 'Uploading…', ready: 'Ready to save. Click Save to update your profile.', invalid: 'Choose a valid PNG, JPG or WebP file up to 2 MB.', error: 'Could not upload the picture. Please try again.', session: 'Sign in to FORMIQ again, then return to your account panel.', label: 'Profile picture' },
  };
  const app = document.getElementById('app');
  let active;
  const text = key => messages[locale() === 'pl' ? 'pl' : 'en'][key];
  const valid = value => {
    try { const url = new URL(value); return url.origin === appOrigin && !url.search && !url.hash && /^\/api\/v1\/avatars\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(url.pathname); }
    catch { return false; }
  };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  function render() {
    if (!active) return;
    const { input, image, choose, remove, hint, status, file, busy, message } = active;
    const picture = valid(input.value) ? input.value : '';
    image.hidden = !picture;
    if (picture && image.src !== picture) image.src = picture;
    if (!picture) image.removeAttribute('src');
    setText(choose, text(busy ? 'busy' : 'choose'));
    setText(remove, text('remove'));
    setText(hint, text('hint'));
    setText(status, message ? text(message) : '');
    status.setAttribute('role', ['invalid', 'error', 'session'].includes(message) ? 'alert' : 'status');
    choose.disabled = busy; remove.disabled = busy || !picture; file.disabled = busy;
    choose.setAttribute('aria-busy', String(busy));
    file.setAttribute('aria-label', text('label'));
  }
  function updatePicture(value) {
    const input = active.input;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }
  function refresh() {
    if (active && !active.input.isConnected) { active.controller?.abort(); active.widget.remove(); active = undefined; }
    const input = [...app.querySelectorAll('input')].find(element => element.id === 'picture' || /(?:^|\.|\[)picture(?:\]|\.0|\[0\])?$/.test(element.name));
    if (!input) return;
    if (active?.input === input) { render(); return; }
    input.hidden = true;
    const widget = document.createElement('div');
    widget.className = 'mod-avatar-upload';
    widget.dataset.avatarUpload = '';
    const image = document.createElement('img'); image.alt = ''; image.width = 80; image.height = 80;
    const controls = document.createElement('div'); controls.className = 'mod-avatar-controls';
    const choose = document.createElement('button'); choose.type = 'button';
    const remove = document.createElement('button'); remove.type = 'button';
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
    const hint = document.createElement('p'); const status = document.createElement('p');
    hint.className = 'mod-avatar-hint'; status.className = 'mod-avatar-status'; status.setAttribute('aria-live', 'polite');
    controls.append(choose, remove); widget.append(image, controls, file, hint, status); input.after(widget);
    active = { input, widget, image, choose, remove, file, hint, status, busy: false, message: '', controller: null };
    choose.addEventListener('click', () => file.click());
    remove.addEventListener('click', () => { active.message = 'ready'; updatePicture(''); });
    input.addEventListener('input', render);
    file.addEventListener('change', async () => {
      const selected = file.files?.[0];
      const state = active;
      if (!selected || state.busy) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
        state.message = 'invalid'; render(); file.value = ''; return;
      }
      state.busy = true; state.message = 'busy'; state.controller = new AbortController(); render();
      try {
        const response = await fetch(`${appOrigin}/api/v1/profile/avatar`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': selected.type }, body: selected,
          signal: state.controller.signal,
        });
        if (response.status === 401) { state.message = 'session'; return; }
        if (!response.ok) { state.message = [413, 415].includes(response.status) ? 'invalid' : 'error'; return; }
        const result = await response.json();
        if (!valid(result.url)) throw new Error('Invalid picture URL');
        if (active === state) { state.message = 'ready'; updatePicture(result.url); }
      } catch { if (!state.controller.signal.aborted) state.message = 'error'; }
      finally { state.busy = false; file.value = ''; if (active === state) render(); }
    });
    input.form?.addEventListener('reset', () => setTimeout(render, 0));
    app.querySelector('#cancel-btn')?.addEventListener('click', () => setTimeout(() => { if (active) { active.message = ''; render(); } }, 0));
    render();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; refresh(); });
  }).observe(app, { childList: true, subtree: true });
  refresh();
  return refresh;
}
