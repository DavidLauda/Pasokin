const test = require('node:test');
const assert = require('node:assert/strict');

const inserts = [];
let conflictOnce = false;
const fakeDb = {
  async insert(table, row) {
    if (conflictOnce) {
      conflictOnce = false;
      throw new Error('Supabase: duplicate key violates unique constraint procurements_reference_code_key');
    }
    inserts.push({ table, row });
    return row;
  },
  async update() { return []; }
};
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const store = require('../src/services/procurementsStore');
const { correlateReply } = require('../src/services/replyCorrelation');

test('new procurements retry code collision and preserve the shared contract', async () => {
  conflictOnce = true;
  const row = await store.create('da063193-2321-4f03-b53c-6ca1eb5f4400',
    { materialName: 'Baja Ringan', quantity: 10000, unit: 'kg', priority: { cost: 0.5 } });
  assert.match(row.reference_code, /^PSK-[A-Z0-9]{4}$/);
  assert.equal(row.material_summary, 'Baja Ringan 10000 kg');
  assert.equal(row.status, 'dispatched');
  assert.equal(row.reply_ai_provider, 'gemma');
  assert.equal(row.weight_preset_used, '{"cost":0.5}');
  assert.equal(inserts.at(-1).table, 'procurements');
});

test('summary confirmation messages cannot receive an AI classification', async () => {
  const row = await store.addMessage({ procurementId: 'proc-1', supplierId: 'supplier-1',
    messageType: 'summary_confirmation', direction: 'inbound', rawText: 'Setuju',
    classifiedAs: 'confirmed' });
  assert.equal(row.message_type, 'summary_confirmation');
  assert.equal(row.classified_as, null);
});

test('unknown procurement status is rejected before reaching the database', async () => {
  await assert.rejects(store.setStatus('proc-1', 'some_other_status'), /tidak valid/);
});

test('reply correlation uses reference and supplier phone, not the newest phone match', async () => {
  const logs = [
    { dispatch_id: 'older', supplier_id: 'supplier-a', phone: '0811111111' },
    { dispatch_id: 'newer', supplier_id: 'supplier-b', phone: '0811111111' }
  ];
  const dependencies = {
    findProcurement: async code => code === 'PSK-AB12' ? { id: 'older', status: 'triaging' } : null,
    findProcurementById: async id => ({ id, status: 'triaging' }),
    listDispatches: async () => logs,
    normalizePhone: phone => String(phone).replace(/^0/, '62')
  };
  const match = await correlateReply('Balasan untuk PSK-AB12: siap', '62811111111', dependencies);
  assert.equal(match.dispatch.supplier_id, 'supplier-a');
  const noCode = await correlateReply('Siap pak', '62811111111', dependencies);
  assert.equal(noCode.dispatch, null);
});

test('procurements persist the selected reply model independently', async () => {
  const requirement = { materialName: 'Baja', quantity: 100, unit: 'batang' };
  const gemini = await store.create('1b45ceeb-f705-44b3-a8ad-a499269d2115', requirement, {}, 'gemini');
  const gemma = await store.create('c593c6ba-c9b5-453b-94f7-c02bb72a3815', requirement);
  assert.equal(gemini.reply_ai_provider, 'gemini');
  assert.equal(gemma.reply_ai_provider, 'gemma');
});

test('reply without an RFQ code matches only one active supplier dispatch', async () => {
  const logs = [
    { dispatch_id: 'active', supplier_id: 'supplier-a', phone: '0811111111' },
    { dispatch_id: 'active', supplier_id: 'supplier-a', phone: '0811111111' },
    { dispatch_id: 'finished', supplier_id: 'supplier-a', phone: '0811111111' }
  ];
  const match = await correlateReply('Siap kirim besok', '62811111111', {
    findProcurement: async () => null,
    findProcurementById: async id => ({ id, status: id === 'finished' ? 'completed' : 'dispatched' }),
    listDispatches: async () => logs,
    normalizePhone: phone => String(phone).replace(/^0/, '62')
  });
  assert.equal(match.procurement.id, 'active');
  assert.equal(match.dispatch.supplier_id, 'supplier-a');
});

test('shared phone inside one procurement is left unmatched rather than misattributed', async () => {
  const match = await correlateReply('PSK-AB12 oke', '0811111111', {
    findProcurement: async () => ({ id: 'same-order', status: 'triaging' }),
    listDispatches: async () => [
      { dispatch_id: 'same-order', supplier_id: 'supplier-a', phone: '0811111111' },
      { dispatch_id: 'same-order', supplier_id: 'supplier-b', phone: '0811111111' }
    ],
    normalizePhone: phone => phone
  });
  assert.equal(match.dispatch, null);
});
