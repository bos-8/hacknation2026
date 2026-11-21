import test from 'node:test';
import assert from 'node:assert/strict';
import { asideKeyboardWidth, asideSize } from '../../apps/web/src/ui/components/aside-size.ts';
import { lockBodyScroll } from '../../apps/web/src/ui/components/body-scroll.ts';
import { createAsideOwner } from '../../apps/web/src/ui/components/aside-owner.ts';

test('opening a new aside closes the previous owner and stale cleanup cannot close the new pane', () => {
  const owner = createAsideOwner();
  const closed = [];
  owner.request('preview', () => { closed.push('preview'); owner.release('preview'); }, () => false);
  assert.equal(owner.getSnapshot(), 'preview');
  owner.request('edit', () => closed.push('edit'), () => false);
  assert.deepEqual(closed, ['preview']);
  assert.equal(owner.getSnapshot(), 'edit');
  owner.release('preview');
  assert.equal(owner.getSnapshot(), 'edit');
  owner.release('edit');
  assert.equal(owner.getSnapshot(), null);
});

test('pending aside operations block replacement until the current owner unlocks', () => {
  const owner = createAsideOwner();
  let locked = true;
  const closed = [];
  owner.request('edit', () => closed.push('edit'), () => locked);
  assert.equal(owner.request('notifications', () => closed.push('notifications'), () => false), false);
  assert.equal(owner.getSnapshot(), 'edit');
  assert.deepEqual(closed, []);
  locked = false;
  assert.equal(owner.request('notifications', () => closed.push('notifications'), () => false), true);
  assert.equal(owner.getSnapshot(), 'notifications');
  assert.deepEqual(closed, ['edit']);
});

test('aside bounds preserve workspace width and switch narrow screens to a full-width overlay', () => {
  assert.deepEqual(asideSize(1200, 420, 'overlay'), { mobile: false, min: 280, max: 720, width: 420 });
  assert.equal(asideSize(900, 1000, 'push').width, 580);
  assert.equal(asideSize(900, 0, 'push').width, 280);
  for (const viewport of [320, 390, 767]) {
    const size = asideSize(viewport, 420, 'push');
    assert.equal(size.mobile, true); assert.equal(size.width, viewport);
  }
  assert.equal(asideSize(1024, Infinity, 'overlay').width, 280);
  assert.equal(asideSize(0, 420, 'overlay').width, 0);
});

test('right-hand resize separators support arrows, accelerated steps and bounded Home/End', () => {
  assert.equal(asideKeyboardWidth('ArrowLeft', 420, 280, 720), 436);
  assert.equal(asideKeyboardWidth('ArrowRight', 420, 280, 720, true), 380);
  assert.equal(asideKeyboardWidth('ArrowLeft', 720, 280, 720), 720);
  assert.equal(asideKeyboardWidth('Home', 420, 280, 720), 280);
  assert.equal(asideKeyboardWidth('End', 420, 280, 720), 720);
  assert.equal(asideKeyboardWidth('Escape', 420, 280, 720), null);
});

test('nested overlays preserve body scroll locking until the last owner closes', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const style = { overflow: 'auto' };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { style } } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const releaseAside = lockBodyScroll(), releasePopup = lockBodyScroll();
  assert.equal(style.overflow, 'hidden');
  releaseAside(); releaseAside(); assert.equal(style.overflow, 'hidden');
  releasePopup(); assert.equal(style.overflow, 'auto');
});

test('only the last connected open popup owns Escape, including blocked top dialogs', async () => {
 const {registerPopup,isTopPopup}=await import('../../apps/web/src/ui/components/popup-stack.ts');
 const bottom={isConnected:true,open:true}, top={isConnected:true,open:true};
 const removeBottom=registerPopup(bottom),removeTop=registerPopup(top);
 assert.equal(isTopPopup(bottom),false);assert.equal(isTopPopup(top),true);
 top.open=false;assert.equal(isTopPopup(bottom),true);
 top.open=true;removeTop();assert.equal(isTopPopup(bottom),true);
 removeBottom();assert.equal(isTopPopup(bottom),false);
});
