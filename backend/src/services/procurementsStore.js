const db = require('../db');
const crypto = require('crypto');

const STATUSES = new Set(['parsing', 'optimizing', 'awaiting_approval', 'dispatched',
  'triaging', 'needs_manual_review', 'awaiting_summary_confirmation', 'completed']);

function referenceCode() {
  return `PSK-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function create(id, requirement, buyerInfo = {}, replyAiProvider = 'gemma') {
  if (!['gemma', 'gemini'].includes(replyAiProvider)) {
    throw Object.assign(new Error('Model AI balasan supplier tidak valid'), { status: 400 });
  }
  const material = requirement.materialName || requirement.material_summary || 'Material';
  const summary = `${material} ${requirement.quantity ?? ''} ${requirement.unit || ''}`.trim();
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await db.insert('procurements', {
        id, reference_code: referenceCode(), buyer_info: buyerInfo,
        reply_ai_provider: replyAiProvider,
        material_summary: summary, parsed_material_summary: requirement,
        weight_preset_used: typeof requirement.priority === 'string'
          ? requirement.priority : JSON.stringify(requirement.priority || {}),
        status: 'dispatched'
      });
    } catch (error) {
      if (!String(error.message).includes('reference_code')) throw error;
    }
  }
  throw new Error('Tidak dapat membuat kode referensi unik');
}

async function setStatus(id, status) {
  if (!id) return null;
  if (!STATUSES.has(status)) throw new Error(`Status procurement tidak valid: ${status}`);
  const rows = await db.update('procurements', 'id', id, { status });
  return rows[0] || null;
}

function get(id) { return db.findOne('procurements', 'id', id); }
function getByReference(code) { return db.findOne('procurements', 'reference_code', code); }

async function list() {
  return db.list('procurements');
}

async function supplierUuid(legacyId) {
  const row = await db.findOne('suppliers', 'id', legacyId);
  return row?.supplier_uuid || null;
}

async function addMessage({ procurementId, supplierId, messageType = 'negotiation',
  direction, rawText, classifiedAs = null }) {
  if (!['negotiation', 'summary_confirmation'].includes(messageType) ||
      !['outbound', 'inbound'].includes(direction)) throw new Error('Jenis pesan tidak valid');
  return db.insert('procurement_messages', {
    procurement_id: procurementId, supplier_id: supplierId,
    message_type: messageType, direction, raw_text: rawText,
    classified_as: messageType === 'summary_confirmation' ? null : classifiedAs
  });
}

async function messages(id) {
  const { data, error } = await db.getClient().from('procurement_messages')
    .select('*').eq('procurement_id', id).order('created_at', { ascending: true });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

async function classifyMessage(id, classification) {
  return db.update('procurement_messages', 'id', id, { classified_as: classification });
}

async function saveAllocations(id, allocations) {
  if (!id || !allocations.length) return [];
  const rows = allocations.map(allocation => ({
    procurement_id: id,
    supplier_id: allocation.supplier_id,
    quantity: allocation.qty,
    price_per_unit: allocation.price_per_unit,
    total_cost: allocation.cost,
    final_score: allocation.score ?? null,
    cost_score: allocation.cost_score ?? null,
    speed_score: allocation.speed_score ?? null,
    reliability_score: allocation.reliability_score_breakdown ?? null,
    distance_score: allocation.distance_score ?? null
  }));
  return db.upsert('allocations', rows, 'procurement_id,supplier_id');
}

async function createPayments(id, allocations) {
  const winners = allocations.filter(allocation => Number(allocation.qty) > 0);
  if (!winners.length) return [];
  const rows = winners.map(allocation => {
    const amount = Number(allocation.qty) * Number(allocation.price_per_unit || allocation.cost / allocation.qty);
    if (!allocation.supplier_id || !Number.isSafeInteger(amount) || amount <= 0) {
      throw Object.assign(new Error('Jumlah pembayaran PO harus positif dan berupa Rupiah bulat'), { status: 400 });
    }
    return { procurement_id: id, supplier_id: allocation.supplier_id,
      amount, status: 'awaiting_payment' };
  });
  const { data, error } = await db.getClient().from('payments').upsert(rows,
    { onConflict: 'procurement_id,supplier_id', ignoreDuplicates: true }).select('*');
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

module.exports = { create, get, getByReference, list, setStatus, supplierUuid,
  addMessage, messages, classifyMessage, saveAllocations, createPayments, referenceCode };
