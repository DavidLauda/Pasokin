// Run while the backend is listening locally. Creates and removes one test row.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const db = require('../src/db');

async function main() {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  let reader;
  try {
    await db.insert('procurements', {
      id,
      status: 'dispatched',
      parsed_material_summary: { test: true },
      buyer_info: { test: true }
    });
    const response = await fetch('http://localhost:4000/api/procurements/events', {
      signal: controller.signal
    });
    assert.equal(response.status, 200);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    async function until(predicate) {
      const deadline = Date.now() + 15000;
      while (!predicate(buffer)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Timed out waiting for Supabase Realtime event');
        const chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), remaining))
        ]);
        if (chunk.done) throw new Error('SSE stream closed');
        buffer += decoder.decode(chunk.value);
      }
    }

    await until(text => text.includes('event: ready'));
    buffer = '';
    await db.update('procurements', 'id', id, { status: 'triaging' });
    await until(text => text.includes(`"id":"${id}"`) && text.includes('"status":"triaging"'));
    console.log('Supabase Realtime smoke test passed');
  } finally {
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    await db.remove('procurements', 'id', id);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
