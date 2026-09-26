// Run with the backend listening locally and DEMO_MODE=true:
// node test/supabase-smoke.js
// Creates one temporary procurement and removes it in finally.
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const db = require('../src/db');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:4000/api';

async function get(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function post(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  const health = await get('/health');
  assert.equal(health.demoMode, true, 'Smoke test must never send live WhatsApp messages');
  const suppliers = await get('/suppliers');
  const supplier = suppliers.find(row => row.material_category === 'Aluminium Grade-A');
  assert.ok(supplier);
  const requirement = {
    materialName: supplier.material_category,
    quantity: 1000,
    unit: supplier.unit,
    maxBudget: 50000000,
    targetDeliveryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    priority: { cost: 40, speed: 40, risk: 20 }
  };
  const initialAllocation = {
    ...supplier,
    supplier_id: supplier.id,
    qty: requirement.quantity,
    cost: requirement.quantity * supplier.price_per_unit
  };
  let dispatchId;

  try {
    const dispatch = await post('/dispatch-wa', {
      allocations: [initialAllocation], requirement, companyName: 'Migration Smoke Test'
    });
    dispatchId = dispatch.dispatch_id;
    assert.equal(dispatch.results[0].status, 'sent');

    const reply = await post('/wa-replies/simulate', { phone: supplier.phone, style: 'confirmed' });
    assert.equal(reply.classification, 'confirmed');

    const optimization = await post('/optimize', {
      requirement, candidates: [supplier], dispatch_id: dispatchId
    });
    assert.equal(optimization.recommended_allocations[0].qty, requirement.quantity);

    const final = await post('/dispatch-wa', {
      allocations: optimization.recommended_allocations,
      requirement,
      dispatch_id: dispatchId,
      companyName: 'Migration Smoke Test',
      type: 'final'
    });
    assert.equal(final.results[0].decision, 'po_confirmed');

    const procurement = await db.findOne('procurements', 'id', dispatchId);
    assert.equal(procurement.status, 'completed');
    const { data: payments, error } = await db.getClient()
      .from('payments').select('status,amount').eq('procurement_id', dispatchId);
    if (error) throw error;
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'awaiting_payment');
    console.log('Supabase smoke test passed: RFQ, reply, allocation, PO, payment');
  } finally {
    if (dispatchId) {
      await db.remove('supplier_replies', 'procurement_id', dispatchId);
      await db.remove('procurements', 'id', dispatchId);
      console.log('Temporary procurement removed');
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
