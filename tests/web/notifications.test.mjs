import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationStore, notificationSummary } from '../../apps/web/src/ui/components/notification-store.ts';

test('brief operation progress survives the normal timeout and is replaced by its result', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  const id = store.push({ mode: 'info', message: 'saving', brief: true, pending: true }, 1000);
  const progress = store.getSnapshot().announcement;
  store.tick(20000);
  store.clearAnnouncement(progress.key);
  assert.equal(store.getSnapshot().announcement, progress);
  assert.equal(progress.pending, true);
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().pulse, null);

  store.push({ id, mode: 'success', message: 'saved', brief: true }, 21000);
  const result = store.getSnapshot().announcement;
  assert.equal(result.id, id);
  assert.equal(result.message, 'saved');
  assert.ok(!result.pending);
  assert.equal(result.until, 26000);
  store.clearAnnouncement(progress.key);
  assert.equal(store.getSnapshot().announcement, result);
  store.clearAnnouncement(result.key);
  assert.equal(store.getSnapshot().announcement, null);
});

test('analysis progress stays visible in the strip and panel until the terminal result', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  const sample = { percent: 0, startedAt: 1000 };
  const id = store.push({ mode: 'info', message: 'sending', brief: true, pending: true, progress: sample }, 1000);
  const analysis = { ...sample, percent: 65, estimatedEndAt: 17000, deadlineAt: 30000 };
  store.push({ id, mode: 'info', message: 'model', brief: true, pending: true, progress: analysis }, 8000);
  store.tick(15000);
  store.clear();
  assert.deepEqual(store.getSnapshot().announcement.progress, analysis);
  assert.deepEqual(store.getSnapshot().items.map(item => item.progress), [analysis]);
  assert.equal(store.getSnapshot().items[0].createdAt, 1000);

  store.push({ id, mode: 'success', message: 'saved', brief: true, progress: { ...sample, percent: 100 } }, 17000);
  assert.equal(store.getSnapshot().announcement.progress.percent, 100);
  assert.equal(store.getSnapshot().items.length, 0);
});

test('analysis errors keep the time the processing notification entered the panel', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  const id = store.push({ mode: 'info', message: 'sending', brief: true, pending: true,
    progress: { percent: 0, startedAt: 1000 } }, 1000);
  store.push({ id, mode: 'error', message: 'format mismatch', brief: true }, 2500);
  assert.equal(store.getSnapshot().items[0].createdAt, 1000);
  assert.equal(store.getSnapshot().items[0].message, 'format mismatch');
});

test('a failed operation can retry under the same ID without leaving an obsolete error in the bell', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  const id = store.push({ mode: 'info', message: 'saving', brief: true, pending: true }, 1000);
  store.push({ id, mode: 'error', message: 'failed', brief: true }, 2000);
  assert.equal(store.getSnapshot().items.length, 1);
  assert.equal(store.getSnapshot().announcement.retained, true);
  store.push({ id, mode: 'info', message: 'retrying', brief: true, pending: true }, 3000);
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().announcement.pending, true);
  store.push({ id, mode: 'success', message: 'saved', brief: true }, 4000);
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().announcement.message, 'saved');
});

test('background completion and account changes clear operation progress', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  const id = store.push({ mode: 'info', message: 'saving', brief: true, pending: true }, 1000, false);
  assert.equal(store.getSnapshot().announcement.pending, true);
  store.push({ id, mode: 'success', message: 'saved', brief: true }, 2000, false);
  assert.equal(store.getSnapshot().announcement, null);
  store.push({ id, mode: 'info', message: 'saving', brief: true, pending: true }, 3000, false);
  store.push({ id, mode: 'error', message: 'failed', brief: true }, 4000, false);
  assert.equal(store.getSnapshot().announcement, null);
  assert.equal(store.getSnapshot().items[0].message, 'failed');
  store.push({ id, mode: 'info', message: 'retrying', brief: true, pending: true }, 5000);
  store.bindOwner('another-user');
  assert.equal(store.getSnapshot().announcement, null);
  assert.equal(store.getSnapshot().items.length, 0);
});

test('notifications are owner-bound, upsert by ID and discard state on account changes', () => {
  const store = new NotificationStore();
  store.push({ mode: 'info', message: 'anonymous' }, 1000);
  assert.equal(store.getSnapshot().items.length, 0);
  store.bindOwner('user-a');
  store.push({ id: 'operation', mode: 'info', message: 'first', persistent: true }, 1000);
  store.push({ id: 'operation', mode: 'success', message: 'updated', persistent: true }, 1100);
  assert.equal(store.getSnapshot().items.length, 1);
  assert.equal(store.getSnapshot().items[0].message, 'updated');
  assert.equal(store.getSnapshot().items[0].createdAt, 1000);
  store.bindOwner('user-a');
  assert.equal(store.getSnapshot().items.length, 1);
  store.bindOwner('user-b');
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().pulse, null);
});

test('notification expiry works without an open panel and pauses until both hover and focus leave', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  store.push({ id: 'timer', mode: 'info', message: 'timer', autoCloseMs: 5000 }, 1000);
  store.pause('timer', 'hover', true, 2000);
  store.pause('timer', 'focus', true, 2500);
  store.pause('timer', 'hover', false, 3000);
  store.tick(20000);
  assert.equal(store.getSnapshot().items.length, 1);
  store.pause('timer', 'focus', false, 21000);
  store.tick(24999);
  assert.equal(store.getSnapshot().items.length, 1);
  store.tick(25000);
  assert.equal(store.getSnapshot().items.length, 0);
});

test('protected notifications resist expiry, dismiss and bulk clear; operation owner can remove them', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  let dismissed = 0;
  store.push({ id: 'protected', mode: 'warning', message: 'working', dismissible: false, onDismiss: () => dismissed++ }, 1000);
  store.push({ id: 'normal', mode: 'success', message: 'done', persistent: true, onDismiss: () => dismissed++ }, 1000);
  store.close('protected'); store.tick(999999); store.clear();
  assert.deepEqual(store.getSnapshot().items.map(item => item.id), ['protected']);
  assert.equal(dismissed, 1);
  store.remove('protected');
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(dismissed, 1);
});

test('notification severity and pulses use bounded bursts and progress updates do not extend them', () => {
  const store = new NotificationStore(); store.bindOwner('user');
  store.push({ id: 'progress', mode: 'info', message: 'one', persistent: true }, 1000);
  const pulseKey = store.getSnapshot().pulse.key;
  store.push({ id: 'progress', mode: 'info', message: 'two', persistent: true }, 2000);
  store.push({ id: 'error', mode: 'error', message: 'error', persistent: true }, 3500);
  assert.equal(store.getSnapshot().pulse.key, pulseKey);
  assert.equal(store.getSnapshot().pulse.until, 4000);
  assert.equal(notificationSummary(store.getSnapshot().items).dominant, 'error');
  assert.deepEqual(notificationSummary(store.getSnapshot().items).counts, { error: 1, warning: 0, success: 0, info: 1 });
  store.tick(4000); assert.equal(store.getSnapshot().pulse, null);
  store.push({ id: 'hidden', mode: 'success', message: 'hidden', persistent: true }, 5000, false);
  assert.equal(store.getSnapshot().pulse, null);
});

test('brief confirmations stay out of the bell and finishing an old animation cannot clear a newer message', () => {
  const store = new NotificationStore();
  store.bindOwner('user-a');
  store.push({ mode: 'success', message: 'saved', brief: true }, 1000);
  const brief = store.getSnapshot().announcement;
  assert.equal(brief.retained, false);
  assert.equal(brief.until, 6000);
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().pulse, null);

  store.push({ mode: 'warning', message: 'review' }, 2000);
  const warning = store.getSnapshot().announcement;
  store.clearAnnouncement(brief.key);
  assert.equal(store.getSnapshot().announcement, warning);
  assert.equal(warning.retained, true);
  store.clearAnnouncement(warning.key);
  assert.equal(store.getSnapshot().announcement, null);
  assert.equal(store.getSnapshot().items[0].message, 'review');
  store.tick(10000);
  assert.equal(store.getSnapshot().items.length, 1);

  store.push({ mode: 'info', message: 'hidden', brief: true }, 11000, false);
  assert.equal(store.getSnapshot().announcement, null);
  store.push({ mode: 'error', message: 'error', persistent: true }, 12000);
  store.bindOwner('user-b');
  assert.equal(store.getSnapshot().announcement, null);
  assert.equal(store.getSnapshot().items.length, 0);
});
