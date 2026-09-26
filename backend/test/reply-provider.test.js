const test = require('node:test');
const assert = require('node:assert/strict');
const geminiTriageService = require('../src/services/geminiTriageService');
const whatsappService = require('../src/services/whatsappService');
const procurementsStore = require('../src/services/procurementsStore');
const triageService = require('../src/services/triageService');
const repliesStore = require('../src/services/repliesStore');

test('Gemini output is kept in review when quantities are short or the output is malformed', () => {
  const requirement = { targetDeliveryDate: '2026-10-10T00:00:00Z' };
  const allocation = { qty: 100, allocated_qty: 0, price: 62000 };
  const sentAt = '2026-10-01T00:00:00Z';
  const result = geminiTriageService.normalizeResponse(JSON.stringify({
    classification: 'confirmed', ai_summary: 'Supplier bisa kirim sebagian',
    ai_extracted: { qty: 80, price: 62000, lead_time_days: 3 }
  }), allocation, requirement, sentAt, '80 batang bisa dikirim 3 hari');
  assert.equal(result.classification, 'needs_manual_review');
  assert.throws(() => geminiTriageService.normalizeResponse('{"classification":"confirmed"}',
    allocation, requirement, sentAt, '100 batang 3 hari'));
});

test('each procurement uses its own saved reply AI provider', async t => {
  const saved = [];
  t.mock.method(procurementsStore, 'get', async id => ({
    id, status: 'dispatched', reply_ai_provider: id === 'p-gemini' ? 'gemini' : 'gemma'
  }));
  t.mock.method(procurementsStore, 'setStatus', async () => {});
  t.mock.method(repliesStore, 'updateReply', async () => {});
  t.mock.method(triageService, 'classifySupplierReply', async (...args) => {
    saved.push(args[4]);
    return { classification: 'confirmed', ai_summary: 'Siap', ai_extracted: {} };
  });
  const dispatch = { requirement_snapshot: {}, allocation_snapshot: {}, dispatched_at: new Date().toISOString() };
  await whatsappService.processReplyClassification({ reply_id: 'r1', dispatch_id: 'p-gemini', message_received: 'Siap' }, dispatch);
  await whatsappService.processReplyClassification({ reply_id: 'r2', dispatch_id: 'p-gemma', message_received: 'Siap' }, dispatch);
  assert.deepEqual(saved, ['gemini', 'gemma']);
});
