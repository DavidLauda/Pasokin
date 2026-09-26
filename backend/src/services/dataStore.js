const crypto = require('crypto');
const db = require('../db');
const geocoding = require('./geocoding');

const editableFields = [
  'name', 'phone', 'material_category', 'categories', 'address', 'location',
  'lat', 'lng', 'max_capacity_qty', 'min_order_qty', 'price_per_unit', 'unit',
  'lead_time_days', 'payment_terms', 'nib', 'npwp', 'payout_bank',
  'payout_account_number', 'payout_account_holder'
];

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalizeIdentity(value, field, length) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const digits = String(value).replace(/[.\s-]/g, '');
  if (!/^\d+$/.test(digits) || !length.includes(digits.length)) invalid(`Format ${field} tidak valid`);
  return digits;
}

function verificationStatus(nib, npwp) {
  if (nib && npwp) return 'verified';
  if (nib || npwp) return 'pending';
  return 'unverified';
}

function supplierInput(input, current = null) {
  const row = Object.fromEntries(editableFields
    .filter(field => Object.prototype.hasOwnProperty.call(input, field))
    .map(field => [field, input[field]]));
  if (row.name !== undefined) row.name = String(row.name).trim();
  if (row.phone !== undefined) row.phone = String(row.phone).trim();
  if (row.phone && !/^\+?[\d\s()-]{8,24}$/.test(row.phone)) invalid('Format nomor kontak tidak valid');
  if (row.address !== undefined) row.address = String(row.address).trim();
  if (row.categories !== undefined) {
    if (!Array.isArray(row.categories)) invalid('Kategori harus berupa daftar');
    row.categories = [...new Set(row.categories.map(value => String(value).trim()).filter(Boolean))];
    row.material_category = row.categories[0] || '';
  } else if (row.material_category !== undefined) {
    row.material_category = String(row.material_category).trim();
    row.categories = row.material_category ? [row.material_category] : [];
  }
  for (const field of ['max_capacity_qty', 'min_order_qty', 'price_per_unit', 'lead_time_days']) {
    if (row[field] === undefined) continue;
    row[field] = Number(row[field]);
    if (!Number.isFinite(row[field]) || row[field] < 0) invalid(`${field} harus angka positif`);
  }
  for (const [field, min, max] of [['lat', -90, 90], ['lng', -180, 180]]) {
    if (row[field] === undefined) continue;
    if (row[field] === null || row[field] === '') { row[field] = null; continue; }
    row[field] = Number(row[field]);
    if (!Number.isFinite(row[field]) || row[field] < min || row[field] > max) invalid(`${field} tidak valid`);
  }
  const latitude = row.lat !== undefined ? row.lat : current?.lat;
  const longitude = row.lng !== undefined ? row.lng : current?.lng;
  if ((latitude == null || latitude === '') !== (longitude == null || longitude === '')) {
    invalid('Latitude dan longitude harus diisi bersamaan');
  }
  if (row.nib !== undefined) row.nib = normalizeIdentity(row.nib, 'NIB', [13]);
  if (row.npwp !== undefined) row.npwp = normalizeIdentity(row.npwp, 'NPWP', [15, 16]);
  row.verification_status = verificationStatus(
    row.nib !== undefined ? row.nib : current?.nib,
    row.npwp !== undefined ? row.npwp : current?.npwp
  );
  return row;
}

async function resolveLocation(row, input, current = null) {
  const hasLat = Object.prototype.hasOwnProperty.call(input, 'lat');
  const hasLng = Object.prototype.hasOwnProperty.call(input, 'lng');
  if (hasLat !== hasLng) invalid('Latitude dan longitude harus diisi bersamaan');

  const addressChanged = !current || (row.address !== undefined && row.address !== current.address);
  if (hasLat && row.lat !== null && row.lng !== null) {
    // Coordinates supplied by the form are a deliberate map pin (or its preview).
    row.location_verified = true;
  } else if (addressChanged) {
    const location = await geocoding.geocodeAddress(row.address);
    row.lat = location?.lat ?? null;
    row.lng = location?.lng ?? null;
    row.location_verified = Boolean(location);
  } else if (hasLat) {
    row.location_verified = false;
  }
  return row;
}

function publicSupplier(row) {
  if (!row) return row;
  const { payout_bank, payout_account_number, payout_account_holder, nib, npwp, ...safe } = row;
  return safe;
}

async function getAllSuppliers() {
  return (await db.list('suppliers')).filter(supplier => supplier.is_active !== false);
}

async function getSuppliersByCategory(category) {
  if (!category) return [];
  const query = category.toLowerCase().trim();
  return (await getAllSuppliers()).filter(s =>
    (s.material_category || '').toLowerCase().includes(query) ||
    (s.categories || []).some(c => c.toLowerCase().includes(query))
  ).map(publicSupplier);
}

async function addSupplier(input, reservedId = null) {
  const row = supplierInput(input);
  if (!row.name || !row.phone || !row.categories?.length || !row.address ||
      !(row.max_capacity_qty > 0) || !(row.min_order_qty > 0) ||
      row.min_order_qty > row.max_capacity_qty) {
    invalid('Nama, kontak, kategori, alamat, kapasitas, dan MOQ yang valid wajib diisi');
  }
  await resolveLocation(row, input);
  return db.insert('suppliers', { id: reservedId || `sup-${crypto.randomUUID()}`, ...row });
}

async function updateSupplier(id, input) {
  const current = await db.findOne('suppliers', 'id', id);
  if (!current || current.is_active === false) return null;
  const changes = supplierInput(input, current);
  if (changes.address !== undefined && !changes.address) invalid('Alamat supplier wajib diisi');
  if (changes.min_order_qty !== undefined || changes.max_capacity_qty !== undefined) {
    const minimum = changes.min_order_qty ?? Number(current.min_order_qty);
    const capacity = changes.max_capacity_qty ?? Number(current.max_capacity_qty);
    if (minimum > capacity) invalid('MOQ tidak boleh melebihi kapasitas');
  }
  await resolveLocation(changes, input, current);
  const rows = await db.update('suppliers', 'id', id, changes);
  return rows[0] || null;
}

async function getSupplierDetail(id) {
  const supplier = await db.findOne('suppliers', 'id', id);
  if (!supplier || supplier.is_active === false) return null;
  const transactions = await db.listWhere('transactions', 'supplier_id', id, 'occurred_at');
  return { ...supplier, transactions };
}

async function deleteSupplier(id) {
  // Preserve FK-backed procurement and payment history.
  const rows = await db.update('suppliers', 'id', id, { is_active: false });
  return rows.length > 0;
}

module.exports = { getAllSuppliers, getSuppliersByCategory, getSupplierDetail,
  addSupplier, updateSupplier, deleteSupplier, publicSupplier, verificationStatus };
