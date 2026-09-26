const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const db = require('../src/db');
const gateway = require('../src/services/xenditPayments');
const payments = require('../src/services/paymentService');
const config = require('../src/services/configService');

test('Xendit VA request uses sandbox Payments API and returns account number', async () => {
  const originalPost = axios.post;
  const originalKey = process.env.XENDIT_SECRET_KEY;
  process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  let request;
  axios.post = async (url, body, options) => {
    request = { url, body, options };
    return { data: { payment_request_id: 'pr-test', actions: [
      { descriptor: 'VIRTUAL_ACCOUNT_NUMBER', value: '1234567890' }
    ] } };
  };
  try {
    const result = await gateway.createVirtualAccount({ id: 'test-id', procurement_id: 'proc-id', amount: 10000 });
    assert.equal(request.url, 'https://api.xendit.co/v3/payment_requests');
    assert.equal(request.body.request_amount, 10000);
    assert.equal(request.body.channel_code, 'BCA_VIRTUAL_ACCOUNT');
    assert.equal(request.options.headers['api-version'], '2024-11-11');
    assert.equal(result.va_reference, '1234567890');
  } finally { axios.post = originalPost;
    if (originalKey === undefined) delete process.env.XENDIT_SECRET_KEY;
    else process.env.XENDIT_SECRET_KEY = originalKey; }
});

test('verified payment webhook changes status once and rejects mismatched amount', async () => {
  const originalFind = db.findOne;
  const originalClient = db.getClient;
  const originalToken = process.env.XENDIT_WEBHOOK_TOKEN;
  process.env.XENDIT_WEBHOOK_TOKEN = 'callback-secret';
  const id = '11111111-1111-4111-8111-111111111111';
  let row = { id, supplier_id: 'supplier-1', amount: 10000,
    status: 'awaiting_payment', gateway_request_id: 'pr-test' };
  db.findOne = async (table) => table === 'payments' ? row : null;
  db.getClient = () => ({ from: () => ({ update(changes) {
    const conditions = [];
    const query = {
      eq(column, value) { conditions.push([column, value]); return query; },
      in(column, values) { conditions.push([column, values]); return query; },
      select() {
        if (conditions.every(([column, value]) => Array.isArray(value)
          ? value.includes(row[column]) : row[column] === value)) {
          row = { ...row, ...changes };
          return Promise.resolve({ data: [row], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }
    };
    return query;
  } }) });
  const payload = { event: 'payment.capture', data: { reference_id: `pasokin-${id}`,
    payment_request_id: 'pr-test', payment_id: 'py-test', status: 'SUCCEEDED',
    currency: 'IDR', request_amount: 10000,
    captures: [{ capture_id: 'capture-test', capture_amount: 10000 }] } };
  try {
    assert.equal(payments.verifyWebhookToken('callback-secret'), true);
    assert.equal(payments.verifyWebhookToken('wrong-secret'), false);
    await assert.rejects(payments.handleWebhook({ ...payload, data: { ...payload.data,
      request_amount: 9000 } }), /Nominal/);
    assert.equal(row.status, 'awaiting_payment');
    assert.deepEqual(await payments.handleWebhook(payload), { processed: true, duplicate: false });
    assert.equal(row.status, 'paid_held');
    assert.deepEqual(await payments.handleWebhook(payload), { processed: false, duplicate: true });
    row = { ...row, status: 'expired', gateway_payment_id: null };
    assert.deepEqual(await payments.handleWebhook(payload), { processed: true, duplicate: false });
    assert.equal(row.status, 'paid_held');
  } finally { db.findOne = originalFind; db.getClient = originalClient;
    if (originalToken === undefined) delete process.env.XENDIT_WEBHOOK_TOKEN;
    else process.env.XENDIT_WEBHOOK_TOKEN = originalToken; }
});

test('demo payment moves through pay, ship, and buyer receipt exactly once', async () => {
  const originalFind = db.findOne;
  const originalClient = db.getClient;
  const originalDemo = config.isDemoMode;
  let row = { id: 'demo-1', supplier_id: 'sup-1', status: 'awaiting_payment',
    gateway_request_id: null, amount: 10000, is_demo: false };
  config.isDemoMode = async () => true;
  db.findOne = async table => table === 'payments' ? row : null;
  db.getClient = () => ({ from: () => ({ update(changes) {
    const conditions = [];
    const query = {
      eq(column, value) { conditions.push([column, value]); return query; },
      select() {
        if (conditions.every(([column, value]) => row[column] === value)) {
          row = { ...row, ...changes };
          return Promise.resolve({ data: [row], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }
    };
    return query;
  } }) });
  try {
    assert.equal((await payments.demoPay('demo-1')).status, 'paid_held');
    await assert.rejects(payments.demoPay('demo-1'), /Status pembayaran berubah/);
    assert.equal((await payments.demoShip('demo-1')).status, 'shipped');
    assert.equal((await payments.receive('demo-1')).status, 'released');
    assert.equal(row.payout_status, 'demo_released');
    await assert.rejects(payments.receive('demo-1'), /Status pembayaran berubah/);
  } finally { db.findOne = originalFind; db.getClient = originalClient;
    config.isDemoMode = originalDemo; }
});

test('public webhook endpoint rejects missing callback token before reading payment data', async () => {
  const app = require('../src/app');
  const originalToken = process.env.XENDIT_WEBHOOK_TOKEN;
  process.env.XENDIT_WEBHOOK_TOKEN = 'test-callback-token';
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/payments/xendit/webhook`;
    const rejected = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.capture' }) });
    assert.equal(rejected.status, 401);
    const accepted = await fetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-callback-token': 'test-callback-token'
    }, body: JSON.stringify({ event: 'unrelated' }) });
    assert.equal(accepted.status, 200);
  } finally { await new Promise(resolve => server.close(resolve));
    if (originalToken === undefined) delete process.env.XENDIT_WEBHOOK_TOKEN;
    else process.env.XENDIT_WEBHOOK_TOKEN = originalToken; }
});
