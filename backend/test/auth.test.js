const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const authService = require('../src/services/authService');
const dataStore = require('../src/services/dataStore');

test('registration rejects invalid roles before creating an account', async () => {
  await assert.rejects(
    authService.register({ name: 'Tester', email: 'test@example.com', password: 'password123', role: 'admin' }),
    /Isi nama, email, peran/
  );
});

test('buyer and supplier routes require the matching authenticated role', async () => {
  const originals = {
    getUser: authService.getUser,
    signIn: authService.signIn,
    register: authService.register,
    getSupplierDetail: dataStore.getSupplierDetail,
    addSupplier: dataStore.addSupplier,
    updateSupplier: dataStore.updateSupplier
  };
  authService.getUser = async token => token === 'buyer-token'
    ? { id: 'buyer-1', email: 'buyer@example.com', app_metadata: { pasokin_role: 'buyer' } }
    : token === 'supplier-token'
      ? { id: 'supplier-1', email: 'supplier@example.com', app_metadata: { pasokin_role: 'supplier', supplier_id: 'sup-owned' } }
      : null;
  authService.signIn = async () => ({ access_token: 'buyer-token', user: { role: 'buyer' } });
  authService.register = async () => ({ access_token: 'supplier-token', user: { role: 'supplier' } });
  dataStore.getSupplierDetail = async id => ({ id, name: 'Mitra Satu' });
  dataStore.addSupplier = async (changes, id) => ({ id, ...changes });
  dataStore.updateSupplier = async (id, changes) => ({ id, ...changes });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'buyer@example.com', password: 'password123' }) });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.role, 'buyer');
    const register = await fetch(`${base}/auth/register`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'supplier@example.com', password: 'password123', role: 'supplier' }) });
    assert.equal(register.status, 201);
    assert.equal((await register.json()).user.role, 'supplier');
    assert.equal((await fetch(`${base}/suppliers`)).status, 401);
    assert.equal((await fetch(`${base}/procurements`, { headers: { Authorization: 'Bearer supplier-token' } })).status, 403);
    const own = await fetch(`${base}/suppliers/me`, { headers: { Authorization: 'Bearer supplier-token' } });
    assert.equal(own.status, 200);
    assert.equal((await own.json()).id, 'sup-owned');
    assert.equal((await fetch(`${base}/suppliers/me`, { headers: { Authorization: 'Bearer buyer-token' } })).status, 403);
    assert.equal((await fetch(`${base}/suppliers/sup-other`, { headers: { Authorization: 'Bearer supplier-token' } })).status, 403);
    const update = await fetch(`${base}/suppliers/me`, {
      method: 'PUT', headers: { Authorization: 'Bearer supplier-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mitra Baru' })
    });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).id, 'sup-owned');
    dataStore.getSupplierDetail = async () => null;
    const create = await fetch(`${base}/suppliers/me`, { method: 'POST',
      headers: { Authorization: 'Bearer supplier-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mitra Baru' }) });
    assert.equal(create.status, 201);
    assert.equal((await create.json()).id, 'sup-owned');
  } finally {
    await new Promise(resolve => server.close(resolve));
    authService.getUser = originals.getUser;
    authService.signIn = originals.signIn;
    authService.register = originals.register;
    dataStore.getSupplierDetail = originals.getSupplierDetail;
    dataStore.addSupplier = originals.addSupplier;
    dataStore.updateSupplier = originals.updateSupplier;
  }
});
