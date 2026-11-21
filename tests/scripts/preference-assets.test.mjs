import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { preferenceAsset, synchronizePreferenceAssets } from '../../scripts/sync-preference-assets.mjs';
import { PREFERENCE_COOKIE_NAMES } from '../../apps/web/src/cookies/core.js';

test('both Keycloak assets match the shared cookie source and expose its browser API', async () => {
  await synchronizePreferenceAssets(undefined, { check: true });
  for (const theme of ['login', 'account']) {
    const source = await readFile(`infra/local/keycloak/themes/FORMIQ/${theme}/resources/js/preference-cookies.js`, 'utf8');
    const context = {};
    runInNewContext(source, context);
    const api = context.FormiqPreferenceCookies;
    assert.equal(api.PREFERENCE_COOKIE_NAMES.theme, PREFERENCE_COOKIE_NAMES.theme);
    assert.equal(api.isPreferenceCookieName('__Http-theme'), false);
    assert.equal(api.isPreferenceCookieName('custom_theme'), true);
    assert.equal(api.preferenceCookie('custom', 'a;b=c', false).split(';')[0], 'custom=a%3Bb%3Dc');
    const properties = await readFile(`infra/local/keycloak/themes/FORMIQ/${theme}/theme.properties`, 'utf8');
    const scripts = /^scripts=(.*)$/m.exec(properties)[1];
    assert.ok(scripts.indexOf('preference-cookies.js') < scripts.indexOf(theme === 'login' ? 'formiq.js' : 'account.js'));
  }
});

test('asset generation is reproducible across line endings and rejects external module dependencies', () => {
  const source = 'export const demo = 1;\n';
  assert.equal(preferenceAsset(source), preferenceAsset(source.replaceAll('\n', '\r\n')));
  assert.throws(() => preferenceAsset('import privateModule from "server-only";\n' + source), /self-contained/);
});
