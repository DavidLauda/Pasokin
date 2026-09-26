const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const procurementsStore = require('../src/services/procurementsStore');
const dispatchLog = require('../src/services/dispatchLog');
const authService = require('../src/services/authService');
const db = require('../src/db');

test('active list and completed history stay separated for multiple procurements', async () => {
  const originalList = procurementsStore.list;
  const originalLogs = dispatchLog.getAllLogs;
  const originalGetUser = authService.getUser;
  const originalDbList = db.list;
  authService.getUser = async token => token === 'buyer-token'
    ? { id: 'buyer-1', app_metadata: { pasokin_role: 'buyer' } } : null;
  procurementsStore.list = async () => [
    { id: 'new-1', reference_code: 'PSK-0001', material_summary: 'Baja Ringan 10.000 kg', status: 'dispatched', created_at: '2026-09-26T09:00:00Z', updated_at: '2026-09-26T09:00:00Z' },
    { id: 'review-1', reference_code: 'PSK-0002', material_summary: 'Semen 500 sak', status: 'needs_manual_review', negotiated_supplier_id: 'supplier-uuid', created_at: '2026-09-26T08:00:00Z', updated_at: '2026-09-26T10:00:00Z' },
    { id: 'done-1', reference_code: 'PSK-0003', material_summary: 'Pasir 20 ton', status: 'completed', manual_price: 75000, manual_quantity: 20, manual_unit: 'ton', created_at: '2026-09-25T08:00:00Z', updated_at: '2026-09-26T11:00:00Z' }
  ];
  dispatchLog.getAllLogs = async () => [{ dispatch_id: 'new-1', supplier_id: 'supplier-1' }];
  db.list = async table => table === 'payments' ? [{ procurement_id: 'done-1', status: 'awaiting_payment' }] : [];
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const activeResponse = await fetch(`${url}/api/procurements`, { headers: { Authorization: 'Bearer buyer-token' } });
    assert.equal(activeResponse.status, 200);
    const active = await activeResponse.json();
    assert.deepEqual(active.map(row => row.id), ['new-1', 'review-1']);
    assert.equal(active[0].supplier_count, 1);
    assert.equal(active[1].supplier_count, 1);

    const historyResponse = await fetch(`${url}/api/procurements/history`, { headers: { Authorization: 'Bearer buyer-token' } });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.deepEqual(history.map(row => row.id), ['done-1']);
    assert.equal(history[0].manual_price, 75000);
    assert.deepEqual(history[0].payment_statuses, ['awaiting_payment']);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    procurementsStore.list = originalList;
    dispatchLog.getAllLogs = originalLogs;
    authService.getUser = originalGetUser;
    db.list = originalDbList;
  }
});
