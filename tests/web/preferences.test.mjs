import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { APP_LOCALES, DEFAULT_LOCALE, LOCALE_META, isAppLocale, getNextLocale } from '../../apps/web/src/schemas/i18n.ts';
import { getNextTheme } from '../../apps/web/src/schemas/theme.ts';
import { CONTRAST_OPTIONS, isAppContrast, getNextContrast } from '../../apps/web/src/schemas/contrast.ts';
import { contrastCookie, readContrastCookie, persistContrast, applyContrast } from '../../apps/web/src/cookies/contrast.ts';
import { getWebConfig } from '../../apps/web/src/config/public.ts';
import { getPublicConfig, getServerConfig } from '../../apps/web/src/config/server.ts';
import { languageCookie, readLanguageCookie, persistLanguage } from '../../apps/web/src/cookies/lang.ts';
import { THEME_COOKIE_KEY, readThemeCookie, persistTheme, applyTheme } from '../../apps/web/src/cookies/theme.ts';
import { PREFERENCE_COOKIE_NAMES, readPreferenceCookie } from '../../apps/web/src/cookies/core.js';
import { parseConfig } from '../../apps/web/src/config/parse.ts';
import { createRequire } from 'node:module';
import { preferenceCookie, preferenceDomain, readBrowserCookie, removePreferenceCookie } from '../../apps/web/src/cookies/preferences.ts';
import { loadMessages } from '../../apps/web/src/i18n/load-messages.ts';
import { messages } from '../../apps/web/src/i18n/catalogs.ts';
import { APP_VERSION, APP_DISPLAY_VERSION } from '../../apps/web/src/config/version.ts';
const { z } = createRequire(new URL('../../apps/web/package.json', import.meta.url))('zod');

function browserCookies(t, { hostname = 'web.modulon.local', rejectDomain = () => false, rejectWrite = () => false } = {}) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const jar = new Map();
  const writes = [];
  const window = { location: { protocol: 'https:', hostname }, matchMedia: () => ({ matches: true }) };
  const document = { documentElement: { dataset: {} },
    get cookie() { return [...jar.values()].map(item => `${item.name}=${item.value}`).join('; '); },
    set cookie(text) {
      writes.push(text);
      const [pair, ...attributes] = text.split(';').map(item => item.trim());
      const split = pair.indexOf('=');
      const name = pair.slice(0, split), value = pair.slice(split + 1);
      const domain = attributes.find(item => item.startsWith('Domain='))?.slice(7);
      const expired = attributes.includes('Max-Age=0');
      if (domain && rejectDomain(domain)) return;
      if (!expired && rejectWrite({ name, domain, value })) return;
      const key = `${domain ?? 'host-only'}:${name}`;
      if (expired) jar.delete(key);
      else jar.set(key, { name, value, domain });
    } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
  });
  return { jar, writes, document, window };
}

test('footer displays a date-only version and serves an exact license copy', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(APP_VERSION, manifest.version.split(/[+-]/)[0]);
  const date = /\+(\d{8})(?:\d{6})?$/.exec(manifest.version)?.[1] ?? process.env.APP_BUILD_DATE;
  assert.equal(APP_DISPLAY_VERSION, date ? `${APP_VERSION}+${date}` : APP_VERSION);
  assert.match(APP_DISPLAY_VERSION, /^\d+\.\d+\.\d+(?:\+\d{8})?$/);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(await readFile('apps/web/public/LICENSE.md')), digest(await readFile('LICENSE.md')));
});

test('supported locales have metadata and reject untrusted locale values', () => {
  assert.deepEqual(APP_LOCALES, ['pl', 'en']);
  assert.equal(DEFAULT_LOCALE, 'pl');
  assert.deepEqual(LOCALE_META.map((item) => item.code), [...APP_LOCALES]);
  for (const value of ['de', '../en', '', null, {}, 'en-US']) assert.equal(isAppLocale(value), false);
  assert.equal(readLanguageCookie(() => 'en'), 'en');
  assert.equal(readLanguageCookie(() => 'de'), undefined);
});

test('public config strips secrets while runtime validation reports field names only', () => {
  const values = { APP_NAME: 'Modulon Test', PORT: '3002', TZ: 'Europe/Warsaw', AUTH_SECRET: 'private-value' };
  assert.deepEqual(getPublicConfig(values), { ...getWebConfig(), APP_NAME: 'Modulon Test' });
  assert.equal(getServerConfig(values).PORT, 3002);
  assert.equal(JSON.stringify(getServerConfig(values)).includes('private-value'), false);
  assert.equal(getWebConfig().APP_NAME, 'FORMIQ');
  for (const invalid of [{ PORT: 'secret-value' }, { PORT: 0 }, { TZ: 'secret-value' }]) {
    assert.throws(() => getServerConfig(invalid), (error) => {
      assert.match(error.message, /Invalid server configuration: (PORT|TZ)/);
      assert.ok(!error.message.includes('secret-value'));
      return true;
    });
  }
  assert.throws(() => getWebConfig({ UI_PREFERENCE_COOKIE_DOMAIN: 'host; Secure' }), /COOKIE_DOMAIN/);
});

test('contrast accepts only normal/high, persists safe values and defaults to normal', () => {
  assert.deepEqual(CONTRAST_OPTIONS, ['normal', 'high']);
  assert.equal(getNextContrast('normal'), 'high');
  assert.equal(getNextContrast('high'), 'normal');
  for (const value of ['system', 'auto', '', undefined, null, {}]) {
    assert.equal(isAppContrast(value), false);
    assert.equal(readContrastCookie(() => value), 'normal');
  }
  assert.equal(readContrastCookie(() => 'high'), 'high');
  assert.equal(contrastCookie('high'), 'formiq_contrast=high; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  assert.ok(!contrastCookie('normal', false).includes('Secure'));
  assert.throws(() => contrastCookie('high; injected=value'), /Invalid contrast/);
  assert.throws(() => getNextContrast('system'), /Invalid contrast/);
});

test('language and theme selectors cycle through supported values and reject unknown preferences', () => {
  assert.equal(getNextLocale('pl'), 'en');
  assert.equal(getNextLocale('en'), 'pl');
  assert.equal(getNextTheme('system'), 'dark');
  assert.equal(getNextTheme('dark'), 'light');
  assert.equal(getNextTheme('light'), 'system');
  assert.throws(() => getNextLocale('de'), /Invalid language/);
  assert.throws(() => getNextTheme('invalid'), /Invalid theme/);
});

test('preference cookies use consistent attributes and reject attribute injection', () => {
  assert.equal(languageCookie('en'), 'formiq_locale=en; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  assert.ok(!languageCookie('pl', false).includes('Secure'));
  assert.throws(() => languageCookie('de'), /Invalid language/);
  assert.throws(() => preferenceCookie('name; bad', 'value'), /name/);
  assert.throws(() => preferenceCookie('name', 'value', true, 'x; Secure'), /domain/);
  assert.ok(preferenceCookie('name', 'a;b=c').startsWith('name=a%3Bb%3Dc;'));
  assert.equal(preferenceDomain('modulon.local', 'api.modulon.local'), 'modulon.local');
  assert.equal(preferenceDomain('modulon.local', 'evilmodulon.local'), undefined);
  assert.equal(preferenceDomain('modulon.local', 'modulon.local.attacker.test'), undefined);
  assert.equal(readThemeCookie(() => 'unknown'), 'system');
  assert.equal(readThemeCookie(() => 'dark'), 'dark');
});

test('browser cookie reader treats malformed encodings as absent', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'NEXT_LOCALE=%E0%A4%A; other=ready' } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  assert.equal(readBrowserCookie('NEXT_LOCALE'), undefined);
  assert.equal(readBrowserCookie('other'), 'ready');
  assert.equal(readBrowserCookie('missing'), undefined);
});

test('actual Polish and English messages satisfy file and key parity', async () => {
  const messages = await loadMessages(path.resolve('apps/web/messages'), APP_LOCALES);
  assert.equal(messages.pl.common.language, 'Język');
  assert.equal(messages.en.common.language, 'Language');
  assert.equal(messages.pl.common.footer.backToTop, 'Wróć na początek strony');
  assert.equal(messages.en.common.footer.backToTop, 'Back to top');
  assert.deepEqual(Object.keys(messages.pl.common.footer.status).sort(), ['available', 'checking', 'unavailable']);
  assert.equal(messages.pl.common.footer.status.available, 'Web: dostępny');
  assert.equal(messages.en.common.footer.status.available, 'Web: available');
});

test('browser preference writes respect HTTP, hostname boundaries and theme selection', (t) => {
  const { document, window, writes } = browserCookies(t);
  window.location.protocol = 'http:';
  persistLanguage('en');
  assert.equal(writes.at(-1), languageCookie('en', false));
  persistLanguage('pl', 'demo_lang');
  assert.ok(writes.at(-1).startsWith('demo_lang=pl;'));
  persistTheme('dark', '', 'demo_theme');
  assert.ok(writes.at(-1).startsWith('demo_theme=dark;'));
  persistContrast('high', '', 'demo_contrast');
  assert.ok(writes.at(-1).startsWith('demo_contrast=high;'));
  persistTheme('dark', 'modulon.local');
  assert.ok(writes.at(-1).includes('Domain=modulon.local'));
  assert.ok(!writes.at(-1).includes('Secure'));
  persistTheme('light', 'unrelated.test');
  assert.ok(!writes.at(-1).includes('Domain='));
  window.location.protocol = 'https:';
  persistTheme('system');
  assert.ok(writes.at(-1).includes('Secure'));
  persistContrast('high', 'modulon.local');
  assert.ok(writes.at(-1).startsWith('formiq_contrast=high;'));
  assert.ok(writes.at(-1).includes('Domain=modulon.local'));
  applyContrast('high');
  assert.equal(document.documentElement.dataset.contrast, 'high');
  applyContrast('normal');
  assert.equal(document.documentElement.dataset.contrast, 'normal');
  assert.throws(() => applyContrast('system'), /Invalid contrast/);
  applyTheme('system');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  applyTheme('light');
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.throws(() => persistTheme('invalid'), /Invalid theme/);
});

test('sharing preferences replaces host-only cookies and cleans up scope probes', (t) => {
  const { jar } = browserCookies(t);
  for (const [persist, value, name] of [[persistTheme, 'dark', 'formiq_theme'], [persistContrast, 'high', 'formiq_contrast']]) {
    persist(value, '', name);
    persist(value, 'MODULON.LOCAL', name);
    assert.equal(jar.has(`host-only:${name}`), false);
    assert.equal(jar.get(`modulon.local:${name}`).value, value);
  }
  assert.equal(jar.size, 2);
});

test('rejected public suffixes preserve preferences without deleting the host cookie', (t) => {
  const { jar, writes } = browserCookies(t, { hostname: 'app.example.co.uk', rejectDomain: domain => domain === 'co.uk' });
  for (const [persist, value, name] of [[persistTheme, 'dark', 'theme'], [persistContrast, 'high', 'contrast']]) {
    persist(value, '', name);
    writes.length = 0;
    persist(value, 'co.uk', name);
    assert.equal(jar.get(`host-only:${name}`).value, value);
    assert.equal(writes.some(text => text.startsWith(`${name}=;`)), false);
  }
  assert.equal(jar.size, 2);
});

test('a rejected final domain write restores a usable host preference', (t) => {
  const { jar } = browserCookies(t, { rejectWrite: ({ name, domain }) => Boolean(domain) && name === 'theme' });
  persistTheme('dark', '', 'theme');
  persistTheme('light', 'modulon.local', 'theme');
  assert.equal(jar.size, 1);
  assert.equal(jar.get('host-only:theme').value, 'light');
});

test('preference deletion matches domain scope and leaves auth cookies untouched', (t) => {
  const { jar, document } = browserCookies(t);
  document.cookie = 'fixture_auth_session=protected; Path=/';
  persistTheme('dark', '', 'theme');
  persistTheme('light', 'modulon.local', 'shared_theme');
  removePreferenceCookie('theme');
  removePreferenceCookie('shared_theme', true, 'modulon.local');
  assert.equal(jar.size, 1);
  assert.equal(jar.get('host-only:fixture_auth_session').value, 'protected');
});

test('configuration and helpers reject reserved prefixes and malformed domain scopes before writing', (t) => {
  const { writes } = browserCookies(t);
  for (const name of ['__Http-theme', '__Host-Http-theme', '__Secure-theme', '__Host-theme', 'x'.repeat(101)]) {
    assert.throws(() => getWebConfig({ THEME_COOKIE_NAME: name }), /THEME_COOKIE_NAME/);
    assert.throws(() => persistTheme('dark', '', name), /cookie name/);
    assert.throws(() => removePreferenceCookie(name), /cookie name/);
  }
  assert.equal(writes.length, 0);
  for (const domain of ['com', 'localhost', '127.0.0.1', 'a.-b.test', 'a-.b.test', 'test; Secure']) {
    assert.throws(() => getWebConfig({ UI_PREFERENCE_COOKIE_DOMAIN: domain }), /COOKIE_DOMAIN/);
    assert.equal(preferenceDomain(domain, 'app.' + domain), undefined);
  }
});

test('message validation rejects missing keys, duplicate namespaces and unsafe locales', async (t) => {
  const parent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(parent, 'modulon-i18n-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith('modulon-i18n-'));
    await rm(target, { recursive: true, force: true });
  });
  for (const locale of APP_LOCALES) {
    await mkdir(path.join(root, locale));
    await writeFile(path.join(root, locale, 'common.json'), '{"common":{"label":"Text"}}');
    await writeFile(path.join(root, locale, 'home.json'), '{"home":{"title":"Title"}}');
  }
  await loadMessages(root, APP_LOCALES);
  await writeFile(path.join(root, 'en', 'home.json'), '{"home":{"different":"Title"}}');
  await assert.rejects(loadMessages(root, APP_LOCALES), /en\/home.json: translation keys differ/);
  await writeFile(path.join(root, 'en', 'home.json'), '{"home":{"title":"Title"}}');
  for (const locale of APP_LOCALES) {
    await writeFile(path.join(root, locale, 'extra.json'), '{"common":{"duplicate":"Text"}}');
  }
  await assert.rejects(loadMessages(root, APP_LOCALES), /duplicate namespace common/);
  await assert.rejects(loadMessages(root, ['../en']), /Invalid locale/);
});

test('statically registered render catalogs match all translation files on disk', async () => {
  assert.deepEqual(messages, await loadMessages('apps/web/messages', APP_LOCALES));
});

test('cookie names are validated, distinct and shared by preference readers and writers', () => {
  const config = getPublicConfig({ LANGUAGE_COOKIE_NAME: 'demo_lang', THEME_COOKIE_NAME: 'demo_theme', CONTRAST_COOKIE_NAME: 'demo_contrast' });
  assert.equal(config.LANGUAGE_COOKIE_NAME, 'demo_lang');
  assert.equal(languageCookie('en', false, config.LANGUAGE_COOKIE_NAME).split(';')[0], 'demo_lang=en');
  assert.equal(contrastCookie('high', false, undefined, config.CONTRAST_COOKIE_NAME).split(';')[0], 'demo_contrast=high');
  const read = (name) => ({ demo_lang: 'en', demo_theme: 'dark', demo_contrast: 'high' })[name];
  assert.equal(readLanguageCookie(read, config.LANGUAGE_COOKIE_NAME), 'en');
  assert.equal(readThemeCookie(read, config.THEME_COOKIE_NAME), 'dark');
  assert.equal(readContrastCookie(read, config.CONTRAST_COOKIE_NAME), 'high');
  for (const value of ['', 'bad; Secure', 'bad=name', 'bad name', '__Host-theme', '__Secure-theme', 'x'.repeat(101)]) {
    assert.throws(() => getPublicConfig({ THEME_COOKIE_NAME: value }), /THEME_COOKIE_NAME/);
  }
  assert.throws(() => getPublicConfig({ LANGUAGE_COOKIE_NAME: 'shared', CONTRAST_COOKIE_NAME: 'shared' }), /CONTRAST_COOKIE_NAME/);
});

test('configuration and standalone cookie writers share defaults and preserve custom names', () => {
  const config = getWebConfig();
  assert.equal(config.THEME_COOKIE_NAME, THEME_COOKIE_KEY);
  assert.equal(config.THEME_COOKIE_NAME, PREFERENCE_COOKIE_NAMES.theme);
  assert.equal(languageCookie('en').split('=')[0], config.LANGUAGE_COOKIE_NAME);
  assert.equal(contrastCookie('high').split('=')[0], config.CONTRAST_COOKIE_NAME);
  assert.equal(readThemeCookie(name => name === 'modulon_theme' ? 'dark' : undefined), 'dark');
  assert.equal(readThemeCookie(name => name === 'modulon_theme' ? 'dark' : undefined, 'custom_theme'), 'system');
  assert.equal(readPreferenceCookie('toString', () => undefined), undefined);
});

test('legacy preferences migrate only after successful persistence of the replacement', (t) => {
  const { document, jar } = browserCookies(t);
  document.cookie = 'modulon_theme=dark; Path=/';
  document.cookie = 'modulon_contrast=high; Path=/';
  document.cookie = 'NEXT_LOCALE=en; Path=/';
  persistTheme(readThemeCookie());
  persistContrast(readContrastCookie());
  persistLanguage(readLanguageCookie());
  assert.equal(jar.size, 3);
  for (const legacy of ['modulon_theme', 'modulon_contrast', 'NEXT_LOCALE']) assert.equal(readBrowserCookie(legacy), undefined);
  assert.equal(readThemeCookie(), 'dark');
  assert.equal(readContrastCookie(), 'high');
  assert.equal(readLanguageCookie(), 'en');
});

test('a rejected replacement preserves the legacy preference for the next read', (t) => {
  const { document, jar } = browserCookies(t, { rejectWrite: ({ name }) => name === THEME_COOKIE_KEY });
  document.cookie = 'modulon_theme=dark; Path=/';
  persistTheme(readThemeCookie());
  assert.equal(jar.size, 1);
  assert.equal(readThemeCookie(), 'dark');
});

test('configuration errors deduplicate fields and discard values and nested causes', () => {
  const schema = z.object({ field: z.string().min(40).regex(/^allowed$/) });
  assert.throws(() => parseConfig(schema, { field: 'private-fixture' }, 'test'), error => {
    assert.equal(error.message, 'Invalid test configuration: field');
    assert.equal(error.cause, undefined);
    assert.equal(Object.hasOwn(error, 'input'), false);
    return true;
  });
});
