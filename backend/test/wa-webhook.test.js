const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const servicePath = require.resolve('../src/services/whatsappService');
require.cache[servicePath] = {
  id: servicePath, filename: servicePath, loaded: true,
  exports: {
    getStatus: async () => ({}),
    handleIncomingWebhook: async () => { throw new Error('database unavailable'); }
  }
};
const router = require('../src/routes/wa');

test('webhook returns a server error when an incoming reply cannot be stored', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/wa', router);
  app.use((error, request, response, next) => response.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/wa/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: '62811111111', message: 'Siap' })
    });
    assert.equal(response.status, 500);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
