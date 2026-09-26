const crypto = require('crypto');
const db = require('../db');
const config = require('./configService');
const whatsapp = require('./whatsappService');
const xendit = require('./xenditPayments');

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}
const table = () => db.getClient().from('payments');
const publicFields = 'id,procurement_id,supplier_id,status,payment_method,va_reference,amount,expires_at,paid_at,shipped_at,delivered_at,released_at,tracking_note,delivery_proof_url,dispute_reason,payout_status,is_demo,created_at,updated_at';

async function get(id) {
  const payment = await db.findOne('payments', 'id', id);
  if (!payment) fail(404, 'Tagihan tidak ditemukan');
  return payment;
}
function safe(payment) {
  return Object.fromEntries(publicFields.split(',').map(key => [key, payment[key]]));
}
async function withSuppliers(payments) {
  const ids = [...new Set(payments.map(row => row.supplier_id))];
  if (!ids.length) return [];
  const [suppliers, allocations] = await Promise.all([
    run(db.getClient().from('suppliers').select('id,name').in('id', ids)),
    run(db.getClient().from('allocations').select('procurement_id,supplier_id,quantity,price_per_unit').in('supplier_id', ids))
  ]);
  const names = new Map(suppliers.map(row => [row.id, row.name]));
  const quantities = new Map(allocations.map(row => [`${row.procurement_id}:${row.supplier_id}`, row]));
  return payments.map(row => ({ ...safe(row), supplier_name: names.get(row.supplier_id) || row.supplier_id,
    quantity: quantities.get(`${row.procurement_id}:${row.supplier_id}`)?.quantity ?? null,
    price_per_unit: quantities.get(`${row.procurement_id}:${row.supplier_id}`)?.price_per_unit ?? null }));
}

async function listForProcurement(procurementId) {
  const rows = await run(table().select(publicFields).eq('procurement_id', procurementId).order('created_at'));
  return withSuppliers(rows);
}
async function listForSupplier(supplierId) {
  const rows = await run(table().select(publicFields).eq('supplier_id', supplierId).order('created_at', { ascending: false }));
  if (!rows.length) return [];
  const procurements = await run(db.getClient().from('procurements').select('id,reference_code,material_summary').in('id', [...new Set(rows.map(row => row.procurement_id))]));
  const refs = new Map(procurements.map(row => [row.id, row]));
  return rows.map(row => ({ ...safe(row), reference_code: refs.get(row.procurement_id)?.reference_code,
    material_summary: refs.get(row.procurement_id)?.material_summary, va_reference: undefined }));
}

async function change(id, expectedStatus, changes) {
  const rows = await run(table().update(changes).eq('id', id).eq('status', expectedStatus).select('*'));
  if (!rows.length) fail(409, 'Status pembayaran berubah. Muat ulang halaman.');
  return rows[0];
}

async function createRequest(id, bank) {
  if (await config.isDemoMode()) fail(409, 'Mode simulasi aktif. Gunakan tombol Simulasi: Bayar.');
  const payment = await get(id);
  if (payment.status !== 'awaiting_payment') fail(409, 'Tagihan tidak lagi menunggu pembayaran');
  if (payment.gateway_request_id) return safe(payment);
  if (!Number.isSafeInteger(Number(payment.amount)) || Number(payment.amount) <= 0) fail(409, 'Jumlah tagihan tidak valid untuk VA');
  const lockCutoff = new Date(Date.now() - 60_000).toISOString();
  const locked = await run(table().update({ gateway_lock_at: new Date().toISOString() }).eq('id', id)
    .eq('status', 'awaiting_payment').is('gateway_request_id', null)
    .or(`gateway_lock_at.is.null,gateway_lock_at.lt.${lockCutoff}`).select('id'));
  if (!locked.length) fail(409, 'Permintaan VA sedang diproses. Coba lagi sebentar.');
  try {
    const result = await xendit.createVirtualAccount(payment, bank);
    const updated = await run(table().update({ ...result, gateway_lock_at: null }).eq('id', id)
      .eq('status', 'awaiting_payment').select('*'));
    return safe(updated[0] || await get(id));
  } catch (error) {
    await run(table().update({ gateway_lock_at: null }).eq('id', id));
    throw error;
  }
}

async function notifyHeld(payment) {
  try {
    const [supplier, procurement] = await Promise.all([
      db.findOne('suppliers', 'id', payment.supplier_id),
      db.findOne('procurements', 'id', payment.procurement_id)
    ]);
    if (supplier?.phone) {
      let timeout;
      try {
        await Promise.race([
          whatsapp.sendMessage(supplier.phone, `Pasokin: pembayaran PO ${procurement?.reference_code || payment.procurement_id} sudah diterima dan dicatat sebagai dana tertahan. Silakan kirim barang dan isi nomor resi/catatan pengiriman di portal supplier.`),
          new Promise(resolve => { timeout = setTimeout(resolve, 4000); })
        ]);
      } finally { clearTimeout(timeout); }
    }
  } catch (error) { console.error('Payment notification failed', error); }
}

async function demoPay(id) {
  if (!await config.isDemoMode()) fail(403, 'Simulasi hanya tersedia saat mode Simulasi aktif');
  const payment = await get(id);
  if (payment.gateway_request_id) fail(409, 'Tagihan ini sudah memiliki VA sandbox; bayar lewat VA tersebut');
  const updated = await change(id, 'awaiting_payment', { status: 'paid_held', is_demo: true, paid_at: new Date().toISOString() });
  await notifyHeld(updated);
  return safe(updated);
}

function verifyWebhookToken(received) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleWebhook(payload) {
  const event = payload?.event;
  const data = payload?.data || {};
  if (!['payment.capture', 'payment_request.expiry'].includes(event)) return { ignored: true };
  const id = /^pasokin-([0-9a-f-]{36})$/i.exec(data.reference_id || '')?.[1];
  if (!id) return { ignored: true };
  const payment = await db.findOne('payments', 'id', id);
  if (!payment) return { ignored: true };
  if (payment.gateway_request_id !== data.payment_request_id) fail(409, 'Referensi gateway tidak cocok');
  if (event === 'payment.capture') {
    if (data.status !== 'SUCCEEDED') return { ignored: true };
    if (data.currency !== 'IDR' || Number(data.request_amount) !== Number(payment.amount) ||
        !data.payment_id || !Array.isArray(data.captures) ||
        data.captures.reduce((sum, item) => sum + Number(item.capture_amount || 0), 0) !== Number(payment.amount)) {
      fail(409, 'Nominal pembayaran tidak cocok');
    }
    if (payment.gateway_payment_id && payment.gateway_payment_id !== data.payment_id) {
      fail(409, 'Pembayaran ganda perlu diperiksa manual');
    }
    // A capture can arrive after an expiry notification. The verified capture
    // is authoritative because funds were actually collected.
    const rows = await run(table().update({ status: 'paid_held', paid_at: new Date().toISOString(),
      gateway_payment_id: data.payment_id }).eq('id', id)
      .in('status', ['awaiting_payment', 'expired']).select('*'));
    if (rows[0]) await notifyHeld(rows[0]);
    return { processed: Boolean(rows[0]), duplicate: !rows[0] };
  }
  const rows = await run(table().update({ status: 'expired' }).eq('id', id).eq('status', 'awaiting_payment').select('id'));
  return { processed: Boolean(rows[0]), duplicate: !rows[0] };
}

async function ship(id, supplierId, input = {}) {
  const payment = await get(id);
  if (payment.supplier_id !== supplierId) fail(403, 'Tagihan ini bukan milik supplier Anda');
  const note = String(input.tracking_note || '').trim();
  const proof = String(input.delivery_proof_url || '').trim();
  if (!note || note.length > 500) fail(400, 'Isi nomor resi atau catatan pengiriman (maksimal 500 karakter)');
  if (proof && (proof.length > 1000 || !/^https:\/\//i.test(proof))) fail(400, 'Tautan bukti pengiriman harus HTTPS');
  return safe(await change(id, 'paid_held', { status: 'shipped', shipped_at: new Date().toISOString(),
    tracking_note: note, delivery_proof_url: proof || null }));
}

async function demoShip(id) {
  if (!await config.isDemoMode()) fail(403, 'Simulasi hanya tersedia saat mode Simulasi aktif');
  const payment = await get(id);
  if (!payment.is_demo) fail(409, 'Pengiriman simulasi hanya untuk pembayaran simulasi');
  return ship(id, payment.supplier_id, { tracking_note: 'Pengiriman simulasi Pasokin' });
}

async function receive(id) {
  const delivered = await change(id, 'shipped', { status: 'delivered', delivered_at: new Date().toISOString() });
  // This records a platform-controlled release decision. It does not send a bank payout.
  // Real disbursement requires a separate licensed payout integration and settlement checks.
  const released = await change(id, 'delivered', { status: 'released', released_at: new Date().toISOString(),
    payout_status: delivered.is_demo ? 'demo_released' : 'pending_manual' });
  return safe(released);
}

async function dispute(id, reason) {
  const detail = String(reason || '').trim();
  if (detail.length < 5 || detail.length > 1000) fail(400, 'Jelaskan masalah dalam 5–1000 karakter');
  const payment = await get(id);
  if (!['paid_held', 'shipped'].includes(payment.status)) fail(409, 'Sengketa tidak bisa dibuka pada status ini');
  return safe(await change(id, payment.status, { status: 'disputed', dispute_reason: detail }));
}

module.exports = { listForProcurement, listForSupplier, createRequest, demoPay,
  verifyWebhookToken, handleWebhook, ship, demoShip, receive, dispute, safe };
