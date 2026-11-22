import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { navigationActive, pageBreadcrumbs, primaryNavigation, secondaryNavigation } from '../../apps/web/src/config/navigation.ts';

test('navigation visibility keeps administration behind the server role decision', () => {
  assert.deepEqual(primaryNavigation(false, false).map(item => item.href), ['/', '/about']);
  assert.deepEqual(primaryNavigation(false, true).map(item => item.href), ['/', '/about', '/forms', '/chat']);
  assert.deepEqual(primaryNavigation(true, true).map(item => item.href), ['/', '/about', '/forms', '/chat', '/admin/files/ocr', '/admin']);
  assert.deepEqual(primaryNavigation(true, true).filter(item => navigationActive('/admin/files/ocr?file=id&version=1', item)).map(item => item.label), ['ocr']);
  const viewer = '/admin/files/ocr/63abb463-c390-48a5-bb2d-a6ba330810ff?version=2';
  assert.deepEqual(primaryNavigation(true, true).filter(item => navigationActive(viewer, item)).map(item => item.label), ['ocr']);
  assert.deepEqual(pageBreadcrumbs(viewer).slice(-2), [{ label: 'ocr', href: '/admin/files/ocr' }, { label: 'file' }]);
  assert.equal(secondaryNavigation('/chat', false), null);
  assert.equal(secondaryNavigation('/chat/settings', false), null);
  const chatTabs = secondaryNavigation('/chat/settings', true).items;
  assert.deepEqual(chatTabs.map(item => item.href), ['/chat', '/chat/settings']);
  assert.equal(navigationActive('/chat/settings', chatTabs[0]), false);
  assert.equal(navigationActive('/chat/settings', chatTabs[1]), true);
  assert.equal(secondaryNavigation('/admin', false), null);
  assert.equal(secondaryNavigation('/administrator', true), null);
  assert.equal(secondaryNavigation('/admin/', true).items[0].href, '/admin');
  assert.equal(secondaryNavigation('/admin/users', false), null);
  assert.deepEqual(secondaryNavigation('/admin/users', true).items.map(item => item.href), ['/admin', '/admin/monitoring', '/admin/users', '/admin/files', '/admin/products', '/admin/tags', '/admin/queue', '/admin/settings']);
  assert.equal(secondaryNavigation('/admin/files', false), null);
  assert.equal(navigationActive('/admin/users', secondaryNavigation('/admin/users', true).items[0]), false);
  assert.equal(navigationActive('/admin/users', secondaryNavigation('/admin/users', true).items.find(item => item.href === '/admin/users')), true);
});

test('public project routes have contextual navigation and breadcrumbs without admin access', () => {
  assert.deepEqual(secondaryNavigation('/about/team', false).items.map(item => item.href), ['/about', '/about/team']);
  assert.equal(secondaryNavigation('/aboutish', false), null);
  const items = secondaryNavigation('/about/team', false).items;
  assert.equal(navigationActive('/about/team', items[0]), false);
  assert.equal(navigationActive('/about/team', items[1]), true);
  assert.deepEqual(pageBreadcrumbs('/about'), [{ label: 'home', href: '/' }, { label: 'about' }]);
  assert.deepEqual(pageBreadcrumbs('/about/team/'), [{ label: 'home', href: '/' }, { label: 'about', href: '/about' }, { label: 'team' }]);
});

test('active routes respect segment boundaries, exact home and trailing slashes', () => {
  const items = primaryNavigation(true, true);
  const home = items.find(item => item.href === '/');
  const admin = items.find(item => item.href === '/admin');
  assert.equal(navigationActive('/', home), true);
  assert.equal(navigationActive('/admin', home), false);
  assert.equal(navigationActive('/admin/', admin), true);
  assert.equal(navigationActive('/admin/users', admin), true);
  assert.equal(navigationActive('/administrator', admin), false);
});

test('contextual gallery links point to existing sections and breadcrumbs use known translated routes', async () => {
  const source = await readFile('apps/web/src/app/[locale]/test/components-gallery.tsx', 'utf8');
  for (const item of secondaryNavigation('/test', false).items) assert.ok(source.includes(`id="${item.href.split('#')[1]}"`));
  assert.deepEqual(pageBreadcrumbs('/'), []);
  assert.deepEqual(pageBreadcrumbs('/admin/'), [{ label: 'home', href: '/' }, { label: 'admin' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/users/'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin' }, { label: 'users' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/files/'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin' }, { label: 'files' }]);
  assert.deepEqual(pageBreadcrumbs('/admin/monitoring/'), [{ label: 'home', href: '/' }, { label: 'admin', href: '/admin' }, { label: 'monitoring' }]);
  assert.deepEqual(pageBreadcrumbs('/chat/settings'), [
    { label: 'home', href: '/' }, { label: 'chat', href: '/chat' }, { label: 'llm' },
  ]);
  assert.deepEqual(pageBreadcrumbs('/test#gallery-buttons'), [{ label: 'home', href: '/' }, { label: 'gallery' }]);
  assert.deepEqual(pageBreadcrumbs('/unknown/private-identifier'), []);
});
