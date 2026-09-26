const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const authService = require('../src/services/authService');
const dataStore = require('../src/services/dataStore');
const geminiService = require('../src/services/geminiService');

test('buyer sees at most five RFQ candidates and dispatch rejects an oversized request', async () => {
  const originalUser = authService.getUser;
  const originalSuppliers = dataStore.getSuppliersByCategory;
  const originalGenerate = geminiService.generateWAMessagesForAllocations;
  const suppliers = Array.from({ length: 7 }, (_, index) => ({
    id: `sup-${index + 1}`, name: `Supplier ${index + 1}`,
    material_category: 'Baja', categories: ['Baja'], phone: `62810000000${index + 1}`
  }));
  let generated = 0;
  authService.getUser = async () => ({ id: 'buyer-1', app_metadata: { pasokin_role: 'buyer' } });
  dataStore.getSuppliersByCategory = async () => suppliers;
  geminiService.generateWAMessagesForAllocations = () => { generated++; return []; };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer buyer-token' };
    const source = await fetch(`${base}/source`, { method: 'POST', headers,
      body: JSON.stringify({ materialName: 'Baja' }) });
    assert.equal(source.status, 200);
    const found = await source.json();
    assert.equal(found.total_matches, 7);
    assert.deepEqual(found.candidates.map(row => row.id), suppliers.slice(0, 5).map(row => row.id));

    const dispatch = await fetch(`${base}/dispatch-wa`, { method: 'POST', headers,
      body: JSON.stringify({ requirement: { materialName: 'Baja' },
        allocations: suppliers.slice(0, 6).map(row => ({ supplier_id: row.id, phone: row.phone })) }) });
    assert.equal(dispatch.status, 400);
    assert.match((await dispatch.json()).error, /maksimal 5 supplier/);
    assert.equal(generated, 0);

    const duplicate = await fetch(`${base}/dispatch-wa`, { method: 'POST', headers,
      body: JSON.stringify({ requirement: { materialName: 'Baja' },
        allocations: [{ supplier_id: 'sup-1' }, { supplier_id: 'sup-1' }] }) });
    assert.equal(duplicate.status, 400);
    assert.equal(generated, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    authService.getUser = originalUser;
    dataStore.getSuppliersByCategory = originalSuppliers;
    geminiService.generateWAMessagesForAllocations = originalGenerate;
  }
});
