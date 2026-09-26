const store = require('./manualConfirmationStore');
const whatsapp = require('./whatsappService');
const db = require('../db');
const procurementsStore = require('./procurementsStore');

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function extractReferenceCode(text) {
  return String(text || '').toUpperCase().match(/\bPSK-[A-Z0-9]{4,}\b/)?.[0] || null;
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits;
}

function buildSummary(procurement, price, unit, quantity) {
  const format = value => new Intl.NumberFormat('id-ID').format(value);
  return `[${procurement.reference_code}] Konfirmasi ringkasan pengadaan\nMaterial: ${procurement.material_summary}\nJumlah: ${format(quantity)} ${unit}\nHarga final: Rp${format(price)} per ${unit}\nMohon balas dengan kode ${procurement.reference_code} dan konfirmasi atau koreksi ringkasan ini.`;
}

async function detail(id) {
  const procurement = await store.getProcurement(id);
  if (!procurement) fail(404, 'Pengadaan tidak ditemukan');
  const summaryMessages = await store.getMessages(id);
  const rejectedReview = procurement.status === 'triaging' &&
    procurement.manual_price == null && summaryMessages.some(message => message.direction === 'outbound');
  return { ...procurement, summary_messages: summaryMessages,
    can_enter_manual_price: procurement.status === 'needs_manual_review' || rejectedReview };
}

async function list() {
  const rows = await store.listCandidates();
  const candidates = await Promise.all(rows.map(row => detail(row.id)));
  return candidates.filter(row => row.status !== 'triaging' || row.can_enter_manual_price);
}

const sending = new Set();

async function submit(id, input) {
  const price = Number(input?.price);
  const quantity = Number(input?.quantity);
  const unit = String(input?.unit || '').trim();
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !unit || unit.length > 40) {
    fail(400, 'Harga dan jumlah harus positif; unit wajib diisi (maksimal 40 karakter)');
  }
  if (sending.has(id)) fail(409, 'Ringkasan untuk pengadaan ini sedang dikirim');
  sending.add(id);
  try {
    const procurement = await detail(id);
    if (!procurement.can_enter_manual_price) fail(409, 'Status pengadaan tidak menerima input harga manual');
    if (!procurement.reference_code || !procurement.negotiated_supplier_id) {
      fail(409, 'Reference code atau supplier negosiasi belum tersedia');
    }
    const supplier = await store.getSupplier(procurement.negotiated_supplier_id);
    if (!supplier?.phone) fail(409, 'Nomor WhatsApp supplier belum tersedia');

    const saved = await store.updateIfStatus(id, procurement.status,
      { manual_price: price, manual_unit: unit, manual_quantity: quantity });
    if (!saved) fail(409, 'Status pengadaan berubah; muat ulang halaman');

    const rawText = buildSummary(procurement, price, unit, quantity);
    const sent = await whatsapp.sendMessage(supplier.phone, rawText);
    if (!sent) fail(502, 'Pesan gagal dikirim; data harga tersimpan dan dapat dicoba lagi');

    await store.addMessage({ procurement_id: id, supplier_id: supplier.id,
      direction: 'outbound', raw_text: rawText });
    const updated = await store.updateIfStatus(id, procurement.status,
      { status: 'awaiting_summary_confirmation' });
    if (!updated) fail(409, 'Pesan terkirim tetapi status berubah; periksa pengadaan ini');
    return detail(id);
  } finally {
    sending.delete(id);
  }
}

async function captureInbound(payload) {
  const rawText = String(payload?.message || '').trim();
  const referenceCode = extractReferenceCode(rawText);
  if (!referenceCode) return false;
  const procurement = await store.getByReferenceCode(referenceCode);
  if (!procurement || procurement.status !== 'awaiting_summary_confirmation' || !procurement.negotiated_supplier_id) return false;
  const supplier = await store.getSupplier(procurement.negotiated_supplier_id);
  if (!supplier?.phone || normalizePhone(supplier.phone) !== normalizePhone(payload?.sender)) return false;
  const prior = await store.getMessages(procurement.id);
  if (!prior.some(message => message.direction === 'outbound' && message.supplier_id === supplier.id)) return false;
  await store.addMessage({ procurement_id: procurement.id, supplier_id: supplier.id,
    direction: 'inbound', raw_text: rawText });
  return true;
}

async function resolve(id, decision) {
  if (!['confirm', 'reject'].includes(decision)) fail(400, 'Keputusan harus confirm atau reject');
  const procurement = await detail(id);
  if (procurement.status !== 'awaiting_summary_confirmation') fail(409, 'Ringkasan belum menunggu keputusan');
  const outbound = procurement.summary_messages.filter(message => message.direction === 'outbound');
  const latest = outbound.at(-1);
  if (!latest || !procurement.summary_messages.some(message => message.direction === 'inbound' &&
      message.supplier_id === latest.supplier_id && message.created_at >= latest.created_at)) {
    fail(409, 'Belum ada balasan supplier untuk ringkasan terakhir');
  }
  const changes = decision === 'confirm'
    ? { status: 'completed' }
    : { status: 'triaging', manual_price: null, manual_unit: null, manual_quantity: null };
  const updated = await store.updateIfStatus(id, 'awaiting_summary_confirmation', changes);
  if (!updated) fail(409, 'Status pengadaan berubah; muat ulang halaman');
  if (decision === 'confirm') {
    const { data, error } = await db.getClient().from('suppliers').select('id')
      .eq('supplier_uuid', procurement.negotiated_supplier_id).single();
    if (error) throw new Error(`Supabase: ${error.message}`);
    await procurementsStore.saveAllocations(id, [{ supplier_id: data.id,
      qty: procurement.manual_quantity, price_per_unit: procurement.manual_price,
      cost: Number(procurement.manual_quantity) * Number(procurement.manual_price) }]);
    await procurementsStore.createPayments(id, [{ supplier_id: data.id,
      qty: procurement.manual_quantity, price_per_unit: procurement.manual_price }]);
  }
  return detail(id);
}

module.exports = { extractReferenceCode, buildSummary, detail, list, submit, captureInbound, resolve };
