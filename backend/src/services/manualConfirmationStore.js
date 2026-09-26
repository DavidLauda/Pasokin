const db = require('../db');

async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

const procurements = () => db.getClient().from('procurements');
const messages = () => db.getClient().from('procurement_messages');

function getProcurement(id) {
  return run(procurements().select('id,reference_code,material_summary,status,negotiated_supplier_id,manual_price,manual_unit,manual_quantity,created_at,updated_at').eq('id', id).maybeSingle());
}

function getByReferenceCode(code) {
  return run(procurements().select('id,reference_code,material_summary,status,negotiated_supplier_id,manual_price,manual_unit,manual_quantity').eq('reference_code', code).maybeSingle());
}

function listCandidates() {
  return run(procurements().select('id,reference_code,material_summary,status,negotiated_supplier_id,manual_price,manual_unit,manual_quantity,updated_at').in('status', ['needs_manual_review', 'awaiting_summary_confirmation', 'triaging']).order('updated_at', { ascending: false }));
}

function getSupplier(id) {
  return run(db.getClient().from('suppliers').select('supplier_uuid,name,phone').eq('supplier_uuid', id).maybeSingle())
    .then(row => row && { id: row.supplier_uuid, name: row.name, phone: row.phone });
}

function getMessages(procurementId) {
  return run(messages().select('id,procurement_id,supplier_id,message_type,direction,raw_text,classified_as,created_at').eq('procurement_id', procurementId).eq('message_type', 'summary_confirmation').order('created_at', { ascending: true }));
}

function addMessage(row) {
  return run(messages().insert({ ...row, message_type: 'summary_confirmation', classified_as: null }).select('*').single());
}

async function updateIfStatus(id, expected, changes) {
  const rows = await run(procurements().update(changes).eq('id', id).eq('status', expected).select('*'));
  return rows[0] || null;
}

module.exports = { getProcurement, getByReferenceCode, listCandidates, getSupplier, getMessages, addMessage, updateIfStatus };
