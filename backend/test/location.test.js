const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const store = require('../src/services/dataStore');
const geocoding = require('../src/services/geocoding');
const { haversineDistance } = require('../src/services/distance');

const supplier = {
  name: 'Toko Baja', phone: '628123456789', categories: ['Baja'],
  address: 'Jl. Sudirman, Jakarta Pusat', max_capacity_qty: 100, min_order_qty: 10
};

test('registration geocodes once, persists coordinates, and tolerates lookup failure', async () => {
  const originalGeocode = geocoding.geocodeAddress;
  const originalInsert = db.insert;
  const inserted = [];
  let calls = 0;
  geocoding.geocodeAddress = async () => { calls++; return calls === 1 ? { lat: -6.2, lng: 106.8 } : null; };
  db.insert = async (_table, row) => { inserted.push(row); return row; };
  try {
    await store.addSupplier(supplier);
    await store.addSupplier({ ...supplier, name: 'Toko Kayu' });
    assert.equal(calls, 2);
    assert.deepEqual([inserted[0].lat, inserted[0].lng, inserted[0].location_verified], [-6.2, 106.8, true]);
    assert.deepEqual([inserted[1].lat, inserted[1].lng, inserted[1].location_verified], [null, null, false]);
  } finally {
    geocoding.geocodeAddress = originalGeocode;
    db.insert = originalInsert;
  }
});

test('manual pin bypasses geocoding and address edits refresh stored coordinates', async () => {
  const originalGeocode = geocoding.geocodeAddress;
  const originalInsert = db.insert;
  const originalFind = db.findOne;
  const originalUpdate = db.update;
  let calls = 0;
  let current = { id: 'sup-1', ...supplier, lat: -6.2, lng: 106.8,
    location_verified: true, is_active: true };
  geocoding.geocodeAddress = async () => { calls++; return { lat: -7.8, lng: 110.4 }; };
  db.insert = async (_table, row) => row;
  db.findOne = async () => current;
  db.update = async (_table, _column, _id, changes) => { current = { ...current, ...changes }; return [current]; };
  try {
    const pinned = await store.addSupplier({ ...supplier, lat: 0, lng: 110 });
    assert.deepEqual([pinned.lat, pinned.lng, pinned.location_verified], [0, 110, true]);
    assert.equal(calls, 0);
    await store.updateSupplier('sup-1', { phone: '62815551234' });
    assert.equal(calls, 0);
    const changed = await store.updateSupplier('sup-1', { address: 'Jl. Malioboro, Yogyakarta' });
    assert.deepEqual([changed.lat, changed.lng, changed.location_verified], [-7.8, 110.4, true]);
    assert.equal(calls, 1);
    geocoding.geocodeAddress = async () => { calls++; return null; };
    const unknown = await store.updateSupplier('sup-1', { address: 'Gudang baru tanpa nomor jalan' });
    assert.deepEqual([unknown.lat, unknown.lng, unknown.location_verified], [null, null, false]);
    assert.equal(calls, 2);
    const corrected = await store.updateSupplier('sup-1', { lat: -7.81, lng: 110.36 });
    assert.deepEqual([corrected.lat, corrected.lng, corrected.location_verified], [-7.81, 110.36, true]);
    assert.equal(calls, 2);
  } finally {
    geocoding.geocodeAddress = originalGeocode;
    db.insert = originalInsert;
    db.findOne = originalFind;
    db.update = originalUpdate;
  }
});

test('Google lookup returns a usable point and treats API denial as unavailable', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_GEOCODING_API_KEY;
  process.env.GOOGLE_GEOCODING_API_KEY = 'test-only-key';
  let requested;
  global.fetch = async url => {
    requested = url;
    return { ok: true, json: async () => ({ status: 'OK',
      results: [{ geometry: { location: { lat: -6.2, lng: 106.8 } } }] }) };
  };
  try {
    assert.deepEqual(await geocoding.geocodeAddress(supplier.address), { lat: -6.2, lng: 106.8 });
    assert.equal(requested.origin, 'https://maps.googleapis.com');
    assert.equal(requested.searchParams.get('address'), supplier.address);
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'REQUEST_DENIED', results: [] }) });
    assert.equal(await geocoding.geocodeAddress(supplier.address), null);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_GEOCODING_API_KEY;
    else process.env.GOOGLE_GEOCODING_API_KEY = originalKey;
  }
});

test('Haversine reports real distance and omits missing coordinates', () => {
  assert.equal(haversineDistance(-6.2, 106.8, -6.2, 106.8), 0);
  assert.ok(haversineDistance(-6.2, 106.8, -7.8, 110.4) > 400);
  assert.equal(haversineDistance(null, 106.8, -7.8, 110.4), null);
  assert.equal(haversineDistance(-91, 106.8, -7.8, 110.4), null);
});

test('buyer search shows distance only for suppliers with a verified point', async () => {
  const app = require('../src/app');
  const authService = require('../src/services/authService');
  const originalUser = authService.getUser;
  const originalSuppliers = store.getSuppliersByCategory;
  authService.getUser = async () => ({ id: 'buyer-1', app_metadata: { pasokin_role: 'buyer' } });
  store.getSuppliersByCategory = async () => [
    { ...supplier, id: 'sup-1', lat: -6.2, lng: 106.8, location_verified: true },
    { ...supplier, id: 'sup-2', lat: -6.3, lng: 106.9, location_verified: false }
  ];
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/source`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer buyer-token' },
      body: JSON.stringify({ materialName: 'Baja', delivery_lat: -6.21, delivery_lng: 106.81 })
    });
    assert.equal(response.status, 200);
    const { candidates } = await response.json();
    assert.ok(candidates[0].distance_km > 0);
    assert.equal(candidates[1].distance_km, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve));
    authService.getUser = originalUser;
    store.getSuppliersByCategory = originalSuppliers;
  }
});
