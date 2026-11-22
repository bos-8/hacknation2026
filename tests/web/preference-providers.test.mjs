import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const { createElement: h } = require('react');
const { renderToString } = require('react-dom/server');
const root = new URL('../../apps/web/src/', import.meta.url);
const nextModules = new Map(['next/navigation', 'next/link'].map(name => [name, pathToFileURL(require.resolve(name)).href]));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (nextModules.has(specifier)) return nextResolve(nextModules.get(specifier), context);
    const candidate = specifier.startsWith('@/') ? new URL(specifier.slice(2), root) :
      context.parentURL?.startsWith(root.href) && specifier.startsWith('.') ? new URL(specifier, context.parentURL) : null;
    if (candidate) {
      for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts']) {
        const target = fileURLToPath(candidate) + suffix;
        if (existsSync(target) && statSync(target).isFile()) return nextResolve(pathToFileURL(target).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(root.href) || !url.endsWith('.tsx')) return nextLoad(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText };
  },
});

const { ThemeProvider, useTheme } = await import('../../apps/web/src/ui/components/theme-provider.tsx');
const { ContrastProvider, useContrast } = await import('../../apps/web/src/ui/components/contrast-provider.tsx');
const { AsideProvider, AsideContent } = await import('../../apps/web/src/ui/components/aside-layout.tsx');
const { OverlayAside } = await import('../../apps/web/src/ui/components/aside.tsx');
const { NextIntlClientProvider } = require('next-intl');
const { NavigationGroup } = await import('../../apps/web/src/ui/layout/navigation-group.tsx');
const { NavbarFrame } = await import('../../apps/web/src/ui/layout/navbar-frame.tsx');
const { primaryNavigation } = await import('../../apps/web/src/config/navigation.ts');

test('preference providers render deterministic SSR snapshots without touching browser storage', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, get() { throw new Error('SSR accessed browser cookies'); } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  function Snapshot() {
    const theme = useTheme(), contrast = useContrast();
    return h('output', null, `${theme.theme}:${contrast.contrast}:${theme.ready}:${contrast.ready}`);
  }
  const render = () => renderToString(h(ThemeProvider, { cookieName: 'custom_theme', cookieDomain: 'example.test' },
    h(ContrastProvider, { cookieName: 'custom_contrast' }, h(Snapshot))));
  assert.equal(render(), '<output>system:normal:false:false</output>');
  assert.equal(render(), render());
});

test('aside shell keeps server content visible and defers browser portals until hydration', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, get() { throw new Error('SSR accessed the browser'); } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const html = renderToString(h(NextIntlClientProvider, { locale: 'en', timeZone: 'Europe/Warsaw',
    messages: { common: { aside: { close: 'Close', resize: 'Resize' } } } },
  h(AsideProvider, null, h(AsideContent, null, h('main', null, 'Server content')),
    h(OverlayAside, { open: true, onClose() {}, title: 'Panel' }, 'Details'))));
  assert.match(html, /<main>Server content<\/main>/);
  assert.match(html, /data-aside-content/);
  assert.doesNotMatch(html, /inert=|popover=|Details/);
});

test('navbar server output exposes translated icon labels and the current page before hydration', () => {
  const html = renderToString(h(NextIntlClientProvider, { locale: 'pl', timeZone: 'Europe/Warsaw',
    messages: { common: { navigation: { home: 'Start', admin: 'Administracja', ocr: 'OCR', about: 'O projekcie', team: 'Zespół' } } } },
  h(NavbarFrame, null, h(NavigationGroup, { items: primaryNavigation(true), pathname: '/admin', label: 'Nawigacja' }))));
  assert.match(html, /data-navbar="true"/);
  assert.match(html, /href="\/pl\/admin"/);
  assert.match(html, /href="\/pl\/admin\/files\/ocr"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-label="Administracja"/);
  assert.match(html, />Administracja<\/span>/);
});
