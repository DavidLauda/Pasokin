const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/services/manualConfirmationStore');
const whatsapp = require('../src/services/whatsappService');
const flow = require('../src/services/manualConfirmation');

test('manual summary: send, inbound review, reject and reopen, then confirm', async () => {
  const original = Object.fromEntries(Object.keys(store).map(key => [key, store[key]]));
  const originalSend = whatsapp.sendMessage;
  const procurement = {
    id: 'proc-1', reference_code: 'PSK-TEST', material_summary: 'Baja Ringan 10.000 kg',
    status: 'needs_manual_review', negotiated_supplier_id: 'supplier-1',
    manual_price: null, manual_unit: null, manual_quantity: null
  };
  const supplier = { id: 'supplier-1', name: 'Supplier Test', phone: '08123456789' };
  const messages = [];
  const sent = [];
  let clock = 0;
  try {
    store.getProcurement = async id => id === procurement.id ? { ...procurement } : null;
    store.getByReferenceCode = async code => code === procurement.reference_code ? { ...procurement } : null;
    store.listCandidates = async () => [{ ...procurement }];
    store.getSupplier = async id => id === supplier.id ? supplier : null;
    store.getMessages = async id => messages.filter(message => message.procurement_id === id).map(message => ({ ...message }));
    store.addMessage = async row => {
      const message = { id: `message-${messages.length + 1}`, ...row, message_type: 'summary_confirmation',
        classified_as: null, created_at: new Date(2026, 0, 1, 0, 0, clock++).toISOString() };
      messages.push(message);
      return message;
    };
    store.updateIfStatus = async (id, expected, changes) => {
      if (id !== procurement.id || procurement.status !== expected) return null;
      Object.assign(procurement, changes);
      return { ...procurement };
    };
    whatsapp.sendMessage = async (phone, text) => { sent.push({ phone, text }); return true; };

    await assert.rejects(() => flow.submit(procurement.id, { price: 0, unit: 'kg', quantity: 10 }), { status: 400 });
    await flow.submit(procurement.id, { price: 65000, unit: 'kg', quantity: 10000 });
    assert.equal(procurement.status, 'awaiting_summary_confirmation');
    assert.match(sent[0].text, /PSK-TEST/);
    assert.match(sent[0].text, /Baja Ringan 10.000 kg/);
    assert.equal(messages[0].direction, 'outbound');
    assert.equal(messages[0].classified_as, null);

    assert.equal(await flow.captureInbound({ sender: '08120000000', message: 'PSK-TEST setuju' }), false);
    assert.equal(await flow.captureInbound({ sender: '628123456789', message: 'PSK-TEST mohon revisi' }), true);
    assert.equal(messages[1].direction, 'inbound');
    assert.equal(messages[1].classified_as, null);

    await flow.resolve(procurement.id, 'reject');
    assert.equal(procurement.status, 'triaging');
    assert.equal(procurement.manual_price, null);
    assert.equal(procurement.manual_unit, null);
    assert.equal(procurement.manual_quantity, null);
    assert.equal((await flow.detail(procurement.id)).can_enter_manual_price, true);

    await flow.submit(procurement.id, { price: 64000, unit: 'kg', quantity: 10000 });
    await assert.rejects(() => flow.resolve(procurement.id, 'confirm'), { status: 409 });
    assert.equal(await flow.captureInbound({ sender: supplier.phone, message: 'Untuk PSK-TEST: setuju' }), true);
    await flow.resolve(procurement.id, 'confirm');
    assert.equal(procurement.status, 'completed');
    assert.equal(messages.length, 4);
    assert.equal(sent.length, 2);
  } finally {
    Object.assign(store, original);
    whatsapp.sendMessage = originalSend;
  }
});
