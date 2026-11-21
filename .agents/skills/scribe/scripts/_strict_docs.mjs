// Optional development validators. Document text is input data, never script source.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const require = createRequire(path.join(path.resolve(process.argv[2]), 'package.json'));
  const issues = [];
  if (request.mode === 'metadata') {
    const YAML = require('yaml');
    for (const document of request.documents) {
      const lines = document.text.replace(/^\uFEFF/, '').split(/\r?\n/);
      let start = lines[0]?.startsWith('<!-- @file:') ? 1 : 0;
      while (lines[start] === '') start++;
      const marker = lines[start] === '---' ? '---' : lines[start] === '```yaml' ? '```' : null;
      if (!marker) {
        if (!/^(README|AGENTS|CLAUDE|CONTRIBUTING|SECURITY|CHANGELOG|LICENSE)(\.[a-z]{2})?\.md$/.test(document.name)) {
          issues.push({ path: document.name, line: 1, rule: 'MISSING_METADATA' });
        }
        continue;
      }
      const end = lines.findIndex((line, index) => index > start && line === marker);
      if (end < 0) { issues.push({ path: document.name, line: start + 1, rule: 'UNCLOSED_METADATA' }); continue; }
      try {
        const parsed = YAML.parseDocument(lines.slice(start + 1, end).join('\n'), { uniqueKeys: true });
        if (parsed.errors.length || parsed.warnings.length) throw new Error('Invalid YAML');
        const value = parsed.toJS({ maxAliasCount: 50 });
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            typeof value.brief !== 'string' || !value.brief.trim() ||
            !Array.isArray(value.tags) || !value.tags.length ||
            value.tags.some(tag => typeof tag !== 'string' || !tag.trim()) ||
            ['author', 'version'].some(key => key in value && (typeof value[key] !== 'string' || !value[key].trim()))) {
          issues.push({ path: document.name, line: start + 1, rule: 'METADATA_SCHEMA' });
        }
      } catch { issues.push({ path: document.name, line: start + 1, rule: 'METADATA_PARSE_ERROR' }); }
    }
  } else if (request.mode === 'markdown') {
    const { lint } = await import(pathToFileURL(require.resolve('markdownlint/promise')).href);
    for (const document of request.documents) {
      const result = await lint({ strings: { document: document.text }, noInlineConfig: true,
        config: { default: false, MD001: true, MD011: true, MD018: true, MD019: true,
          MD020: true, MD021: true, MD031: true, MD032: true, MD037: true,
          MD038: true, MD042: true, MD056: true, MD058: true } });
      for (const error of result.document) issues.push({ path: document.name, line: error.lineNumber, rule: error.ruleNames[0] });
    }
  } else if (request.mode === 'mermaid') {
    if (!request.diagrams.length) {
      process.stdout.write(JSON.stringify({ status: 'PASS', issues: [], checked: 0 }));
      process.exit(0);
    }
    const { JSDOM } = await import(pathToFileURL(require.resolve('jsdom')).href);
    // No resources or runScripts option: external fetching and embedded script execution stay disabled.
    const dom = new JSDOM('');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = () => {};
    const { default: mermaid } = await import(pathToFileURL(require.resolve('mermaid')).href);
    if (typeof mermaid.parse !== 'function') throw new Error('Parser unavailable');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    for (const diagram of request.diagrams) {
      let valid;
      try { valid = Boolean(await mermaid.parse(diagram.text, { suppressErrors: true })); }
      catch { valid = false; }
      if (!valid) issues.push({ path: diagram.path, line: diagram.line, rule: 'MERMAID_PARSE_ERROR' });
    }
    dom.window.close();
  } else throw new Error('Unknown validator');
  process.stdout.write(JSON.stringify({ status: issues.length ? 'FAILED' : 'PASS', issues }));
} catch (error) {
  const reason = error.code || error.name;
  process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE', reason: /^[A-Za-z0-9_]+$/.test(reason) ? reason : 'Error', issues: [{ rule: 'VALIDATOR_UNAVAILABLE' }] }));
}
