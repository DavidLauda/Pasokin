const db = require('../db');

function create(id, requirement, buyerInfo = {}) {
  return db.insert('procurements', {
    id,
    buyer_info: buyerInfo,
    parsed_material_summary: requirement,
    weight_preset_used: requirement.priority || {},
    status: 'dispatched'
  });
}

async function setStatus(id, status) {
  if (!id) return null;
  const rows = await db.update('procurements', 'id', id, { status });
  return rows[0] || null;
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
  return db.upsert('payments', winners.map(allocation => ({
    procurement_id: id,
    supplier_id: allocation.supplier_id,
    amount: allocation.cost,
    status: 'awaiting_payment'
  })), 'procurement_id,supplier_id');
}

module.exports = { create, setStatus, saveAllocations, createPayments };
