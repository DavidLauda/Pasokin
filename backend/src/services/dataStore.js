const crypto = require('crypto');
const db = require('../db');

const editableFields = [
  'name', 'phone', 'material_category', 'categories', 'address', 'location',
  'lat', 'lng', 'max_capacity_qty', 'min_order_qty', 'price_per_unit', 'unit',
  'lead_time_days', 'verification_status', 'reliability_score',
  'payout_bank', 'payout_account_number', 'payout_account_holder'
];

function supplierInput(input) {
  const row = Object.fromEntries(editableFields
    .filter(field => input[field] !== undefined)
    .map(field => [field, input[field]]));
  if (!row.material_category && Array.isArray(row.categories)) {
    row.material_category = row.categories[0];
  }
  if (row.material_category && !row.categories) row.categories = [row.material_category];
  return row;
}

function publicSupplier(row) {
  const { payout_bank, payout_account_number, payout_account_holder, ...safe } = row;
  return safe;
}

async function getAllSuppliers() {
  return (await db.list('suppliers'))
    .filter(supplier => supplier.is_active !== false)
    .map(publicSupplier);
}

async function getSuppliersByCategory(category) {
  if (!category) return [];
  const query = category.toLowerCase().trim();
  return (await getAllSuppliers()).filter(s =>
    s.material_category.toLowerCase().includes(query) ||
    (s.categories || []).some(c => c.toLowerCase().includes(query))
  );
}

function addSupplier(input) {
  return db.insert('suppliers', { id: `sup-${crypto.randomUUID()}`, ...supplierInput(input) })
    .then(publicSupplier);
}

async function updateSupplier(id, input) {
  const rows = await db.update('suppliers', 'id', id, supplierInput(input));
  return rows[0] ? publicSupplier(rows[0]) : null;
}

async function deleteSupplier(id) {
  // Preserve FK-backed procurement and payment history.
  const rows = await db.update('suppliers', 'id', id, { is_active: false });
  return rows.length > 0;
}

module.exports = { getAllSuppliers, getSuppliersByCategory, addSupplier,
  updateSupplier, deleteSupplier };
