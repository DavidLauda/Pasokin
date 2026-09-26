import test from 'node:test';
import assert from 'node:assert/strict';
import { createdThisMonth, monthlyActivity } from '../src/components/procurementContext.js';

const now = new Date('2026-09-26T10:00:00+07:00');

test('monthly activity counts unique contacted suppliers across active and completed procurements', () => {
  const active = [
    { id: 'active-1', created_at: '2026-09-05T08:00:00+07:00', status: 'triaging' },
    { id: 'old-1', created_at: '2026-08-31T08:00:00+07:00', status: 'dispatched' }
  ];
  const history = [{ id: 'done-1', created_at: '2026-09-03T08:00:00+07:00', status: 'completed',
    suppliers: [{ supplier_id: 'sup-1', status: 'sent' }, { supplier_id: 'sup-2', status: 'failed' }] }];
  const details = new Map([['active-1', { dispatched_suppliers: [
    { supplier_id: 'sup-1', status: 'sent' }, { supplier_id: 'sup-3', status: 'sent' }
  ] }]]);
  assert.deepEqual(monthlyActivity(active, history, details, now), { created: 2, completed: 1, contacted: 2 });
  assert.equal(createdThisMonth(active[1], now), false);
});

test('missing active detail does not present a guessed supplier count', () => {
  const active = [{ id: 'active-1', created_at: '2026-09-05T08:00:00+07:00', status: 'dispatched' }];
  assert.deepEqual(monthlyActivity(active, [], new Map(), now), { created: 1, completed: 0, contacted: null });
});
