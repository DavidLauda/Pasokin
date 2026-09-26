const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('Supabase Auth registration, login, refresh, verification, and logout flow', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let user = null;
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const path = new URL(request.url, 'http://127.0.0.1');
    requests.push({ method: request.method, path: path.pathname, body });
    response.setHeader('Content-Type', 'application/json');
    if (path.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
      user = { id: 'user-1', email: body.email, app_metadata: body.app_metadata,
        user_metadata: body.user_metadata };
      response.end(JSON.stringify({ user }));
    } else if (path.pathname === '/auth/v1/token') {
      response.end(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token',
        token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    } else if (path.pathname === '/auth/v1/user' && request.method === 'GET') {
      response.end(JSON.stringify({ user }));
    } else if (path.pathname === '/auth/v1/logout' && request.method === 'POST') {
      response.statusCode = 204;
      response.end();
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: 'unexpected endpoint' }));
    }
  });
  server.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    const auth = require('../src/services/authService');
    const registered = await auth.register({ email: 'Mitra@Example.com', password: 'password123',
      name: 'Mitra Baja', role: 'supplier' });
    assert.equal(registered.user.role, 'supplier');
    assert.equal(registered.user.email, 'mitra@example.com');
    assert.match(user.app_metadata.supplier_id, /^sup-/);
    assert.equal(requests[0].body.email_confirm, true);
    assert.equal((await auth.signIn('mitra@example.com', 'password123', 'supplier')).user.role, 'supplier');
    await assert.rejects(auth.signIn('mitra@example.com', 'password123', 'buyer'), error =>
      error.status === 403 && /terdaftar sebagai Supplier/.test(error.message));
    assert.equal((await auth.refresh('refresh-token')).access_token, 'access-token');
    assert.equal((await auth.getUser('access-token')).id, 'user-1');
    await auth.signOut('access-token');
    assert.ok(requests.some(item => item.path === '/auth/v1/logout'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
