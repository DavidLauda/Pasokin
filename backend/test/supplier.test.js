const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const store = require('../src/services/dataStore');

test('supplier registration derives verification and protects reliability and payout responses', async () => {
  const originalInsert = db.insert;
  let inserted;
  db.insert = async (_table, row) => { inserted = row; return row; };
  try {
    const row = await store.addSupplier({
      name: ' PT Baja ', phone: '628123456789', categories: ['Besi', 'Semen'],
      address: 'Jakarta Selatan', max_capacity_qty: 100, min_order_qty: 10,
      nib: '1234567890123', npwp: '1234567890123456',
      payout_bank: 'Bank A', payout_account_number: '1234',
      verification_status: 'unverified', reliability_score: 1
    });
    assert.equal(inserted.name, 'PT Baja');
    assert.equal(inserted.material_category, 'Besi');
    assert.equal(inserted.verification_status, 'verified');
    assert.equal(inserted.reliability_score, undefined);
    assert.equal(row.payout_bank, 'Bank A');
    const publicRow = store.publicSupplier(row);
    assert.equal(publicRow.payout_bank, undefined);
    assert.equal(publicRow.payout_account_number, undefined);
    assert.equal(publicRow.nib, undefined);
    assert.equal(publicRow.npwp, undefined);
  } finally { db.insert = originalInsert; }
});

test('supplier update ignores client scores and retains verification when identity fields omitted', async () => {
  const originalFindOne = db.findOne;
  const originalUpdate = db.update;
  let changes;
  db.findOne = async () => ({ id: 'sup-1', nib: '1234567890123', npwp: '123456789012345',
    min_order_qty: 10, max_capacity_qty: 100, is_active: true });
  db.update = async (_table, _column, _value, row) => { changes = row; return [row]; };
  try {
    await store.updateSupplier('sup-1', { phone: '62815551234', reliability_score: 0,
      verification_status: 'unverified' });
    assert.equal(changes.reliability_score, undefined);
    assert.equal(changes.verification_status, 'verified');
  } finally { db.findOne = originalFindOne; db.update = originalUpdate; }
});

test('invalid identity format and MOQ above capacity are rejected', async () => {
  await assert.rejects(() => store.addSupplier({ name: 'A', phone: '628123456789',
    categories: ['Semen'], address: 'Jakarta', max_capacity_qty: 100,
    min_order_qty: 10, nib: 'not-a-nib' }), /NIB/);
  await assert.rejects(() => store.addSupplier({ name: 'A', phone: '628123456789',
    categories: ['Semen'], address: 'Jakarta', max_capacity_qty: 10,
    min_order_qty: 100 }), /MOQ/);
});

test('admin supplier detail requires backend token and keeps payout out of public detail', async () => {
  const app = require('../src/app');
  const authService = require('../src/services/authService');
  const originalDetail = store.getSupplierDetail;
  const originalGetUser = authService.getUser;
  const originalToken = process.env.PASOKIN_ADMIN_TOKEN;
  process.env.PASOKIN_ADMIN_TOKEN = 'test-only-admin-token';
  authService.getUser = async token => token === 'buyer-token'
    ? { id: 'buyer-1', app_metadata: { pasokin_role: 'buyer' } } : null;
  store.getSupplierDetail = async () => ({ id: 'sup-1', name: 'Supplier A',
    nib: '1234567890123', payout_bank: 'Bank A', transactions: [] });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/suppliers`;
    const publicResponse = await fetch(`${base}/sup-1`, {
      headers: { Authorization: 'Bearer buyer-token' }
    });
    const publicRow = await publicResponse.json();
    assert.equal(publicRow.payout_bank, undefined);
    assert.equal(publicRow.nib, undefined);
    const denied = await fetch(`${base}/admin/sup-1`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${base}/admin/sup-1`, {
      headers: { Authorization: 'Bearer buyer-token', 'x-pasokin-admin-token': 'test-only-admin-token' }
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).payout_bank, 'Bank A');
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.getSupplierDetail = originalDetail;
    authService.getUser = originalGetUser;
    if (originalToken === undefined) delete process.env.PASOKIN_ADMIN_TOKEN;
    else process.env.PASOKIN_ADMIN_TOKEN = originalToken;
  }
});
