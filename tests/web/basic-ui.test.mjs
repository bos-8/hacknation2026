import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const { createElement: h } = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const basicRoot = new URL('../../apps/web/src/ui/basic/', import.meta.url).href;

// Use the installed TypeScript compiler for TSX, without adding a test runtime dependency.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith(basicRoot) || !url.endsWith('.tsx')) return nextLoad(url, context);
    const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText;
    return { format: 'module', source, shortCircuit: true };
  },
});
const ui = await import('../../apps/web/src/ui/basic/index.ts');
const { tooltipPosition } = await import('../../apps/web/src/ui/basic/tooltip-position.ts');

test('tooltip positions honor all four placements and stay inside viewport edges', () => {
  const anchor = { left: 100, top: 100, width: 40, height: 20 };
  const tooltip = { width: 60, height: 30 };
  const viewport = { width: 300, height: 200 };
  assert.deepEqual(tooltipPosition(anchor, tooltip, viewport, 'top'), { left: 90, top: 63 });
  assert.deepEqual(tooltipPosition(anchor, tooltip, viewport, 'bottom'), { left: 90, top: 127 });
  assert.deepEqual(tooltipPosition(anchor, tooltip, viewport, 'left'), { left: 33, top: 95 });
  assert.deepEqual(tooltipPosition(anchor, tooltip, viewport, 'right'), { left: 147, top: 95 });
  assert.deepEqual(tooltipPosition({ ...anchor, left: 0, top: 0 }, tooltip, viewport, 'top'), { left: 8, top: 8 });
  assert.deepEqual(tooltipPosition({ ...anchor, left: 290, top: 190 }, tooltip, viewport, 'right'), { left: 232, top: 162 });
});

test('buttons default to non-submitting actions and preserve native disabled and submit behavior', () => {
  const html = render(h(ui.Button, { disabled: true }, 'Save'));
  assert.match(html, /type="button"/);
  assert.match(html, /disabled=""/);
  assert.match(render(h(ui.Button, { type: 'submit' }, 'Save')), /type="submit"/);
  const icon = render(h(ui.IconButton, { label: 'Close' }, 'X'));
  assert.match(icon, /aria-label="Close"/);
  assert.match(icon, /aria-hidden="true"/);
});

test('tooltip preserves the trigger when its children are not a single React element', () => {
  const html = render(h(ui.Tooltip, { content: 'Help' }, [h('button', { key: 'trigger', 'aria-describedby': 'existing' }, 'Trigger')]));
  assert.match(html, /<button aria-describedby="existing">Trigger<\/button>/);
  assert.doesNotThrow(() => render(h(ui.Tooltip, { content: 'Help' }, null)));
});

function classList(html) {
  return html.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
}

test('per-instance Tailwind overrides replace conflicting defaults while other instances keep their defaults', () => {
  const defaultClasses = classList(render(h(ui.Button, null, 'Save')));
  assert.ok(defaultClasses.includes('rounded-md'));
  assert.ok(defaultClasses.includes('px-3'));
  const customClasses = classList(render(h(ui.Button, {
    className: 'rounded-none px-9 bg-blue-600 hover:bg-blue-700',
  }, 'Save')));
  for (const value of ['rounded-none', 'px-9', 'bg-blue-600', 'hover:bg-blue-700', 'py-2']) {
    assert.ok(customClasses.includes(value), value);
  }
  for (const value of ['rounded-md', 'px-3', 'bg-button', 'hover:bg-button-hover']) {
    assert.ok(!customClasses.includes(value), value);
  }
  assert.deepEqual(classList(render(h(ui.Button, null, 'Save'))), defaultClasses);
  const noShadow = classList(render(h(ui.Button, { className: 'shadow-none' }, 'Save')));
  assert.ok(noShadow.includes('shadow-none') && !noShadow.includes('shadow-button'));
  const customShadow = classList(render(h(ui.Button, { className: 'shadow-lg' }, 'Save')));
  assert.ok(customShadow.includes('shadow-lg') && !customShadow.includes('shadow-button'));
  const cell = classList(render(h(ui.TableCell, { className: 'p-0' }, 'Value')));
  assert.ok(cell.includes('p-0'));
  assert.ok(!cell.includes('px-3') && !cell.includes('py-2'));
  const heading = classList(render(h(ui.Heading, { level: 1, className: 'text-sm' }, 'Title')));
  assert.ok(heading.includes('text-sm') && !heading.includes('text-3xl'));
  const large = classList(render(h(ui.Button, { size: 'lg' }, 'Save')));
  assert.ok(large.includes('min-h-11') && large.includes('text-base') && !large.includes('text-sm'));
});

test('every basic component forwards caller-provided classes', () => {
  for (const [name, Component] of Object.entries(ui)) {
    const props = { className: 'rounded-none p-0 custom-instance' };
    if (name === 'IconButton' || name === 'Spinner') props.label = 'Accessible label';
    const element = name === 'Tooltip'
      ? h(Component, { ...props, content: 'Help' }, h('button', null, 'Trigger'))
      : h(Component, props);
    const classes = classList(render(element));
    for (const value of ['rounded-none', 'p-0', 'custom-instance']) {
      assert.ok(classes.includes(value), name + ': ' + value);
    }
  }
});

test('form controls keep names, constraints, selected values and error associations', () => {
  const html = render(h(ui.Form, null,
    h(ui.Label, { htmlFor: 'email' }, 'Email'),
    h(ui.Input, { id: 'email', name: 'email', type: 'email', required: true,
      'aria-invalid': true, 'aria-describedby': 'email-error' }),
    h(ui.FieldError, { id: 'email-error' }, 'Enter an email'),
    h(ui.Select, { name: 'language', defaultValue: 'en' },
      h(ui.Option, { value: 'pl' }, 'Polski'), h(ui.Option, { value: 'en' }, 'English')),
    h(ui.Textarea, { name: 'notes', maxLength: 20, defaultValue: 'Text' }),
  ));
  for (const attribute of ['for="email"', 'type="email"', 'required=""', 'aria-describedby="email-error"',
    'id="email-error"', 'role="alert"', 'value="en" selected=""', 'maxLength="20"']) {
    assert.ok(html.includes(attribute), attribute);
  }
});

test('native toggles and ranges expose the correct input types and state', () => {
  assert.match(render(h(ui.Checkbox, { name: 'agree', defaultChecked: true })), /checked=""/);
  assert.match(render(h(ui.Checkbox)), /type="checkbox"/);
  assert.match(render(h(ui.Radio, { name: 'choice' })), /type="radio"/);
  assert.match(render(h(ui.Switch, { 'aria-label': 'Notifications' })), /role="switch"/);
  const range = render(h(ui.Range, { min: 1, max: 10, step: 1, defaultValue: 5 }));
  for (const attribute of ['type="range"', 'min="1"', 'max="10"', 'value="5"']) assert.ok(range.includes(attribute));
});

test('tables, disclosures and progress indicators retain native semantics and accessible labels', () => {
  const table = render(h(ui.Table, null,
    h(ui.TableCaption, null, 'Results'),
    h(ui.TableHead, null, h(ui.TableRow, null, h(ui.TableHeader, null, 'Name'))),
    h(ui.TableBody, null, h(ui.TableRow, null, h(ui.TableCell, null, 'Example'))),
  ));
  assert.match(table, /<caption/);
  assert.match(table, /scope="col"/);
  assert.match(table, /<tbody/);
  assert.match(render(h(ui.Details, { open: true }, h(ui.Summary, null, 'More'))), /<summary/);
  assert.match(render(h(ui.Dialog, { 'aria-labelledby': 'title' }, h(ui.Heading, { id: 'title' }, 'Confirm'))), /<dialog/);
  assert.match(render(h(ui.Spinner, { label: 'Loading' })), /role="status"/);
  assert.match(render(h(ui.Spinner, { label: 'Loading' })), /Loading/);
  assert.match(render(h(ui.Progress, { value: 2, max: 5, 'aria-label': 'Upload' })), /value="2"/);
  assert.match(render(h(ui.Meter, { value: 4, min: 0, max: 10, 'aria-label': 'Usage' })), /<meter/);
});
