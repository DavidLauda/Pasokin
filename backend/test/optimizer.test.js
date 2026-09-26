const test = require('node:test');
const assert = require('node:assert/strict');
const { optimizeAllocation } = require('../src/services/optimizerService');

test('allocation keeps budget, capacity, MOQ, and score breakdown intact', () => {
  const requirement = {
    quantity: 100,
    maxBudget: 1050,
    priority: { cost: 50, speed: 30, risk: 20 }
  };
  const candidates = [
    { id: 'a', name: 'A', phone: '1', location: 'Jakarta', price_per_unit: 10,
      lead_time_days: 3, reliability_score: 0.9, min_order_qty: 20, max_capacity_qty: 60 },
    { id: 'b', name: 'B', phone: '2', location: 'Bandung', price_per_unit: 11,
      lead_time_days: 2, reliability_score: 0.8, min_order_qty: 20, max_capacity_qty: 100 }
  ];

  const result = optimizeAllocation(requirement, candidates);
  assert.ok(result.totalAllocatedQty <= requirement.quantity);
  assert.ok(result.total_cost <= requirement.maxBudget);
  for (const allocation of result.recommended_allocations) {
    const supplier = candidates.find(candidate => candidate.id === allocation.supplier_id);
    assert.ok(allocation.qty <= supplier.max_capacity_qty);
    assert.ok(allocation.qty === 0 || allocation.qty >= supplier.min_order_qty);
    assert.ok(Number.isFinite(allocation.score));
    assert.ok(allocation.cost_score >= 0 && allocation.cost_score <= 1);
    assert.ok(allocation.speed_score >= 0 && allocation.speed_score <= 1);
    assert.ok(allocation.reliability_score_breakdown >= 0 &&
      allocation.reliability_score_breakdown <= 1);
  }
});

test('empty candidate pool has no allocation', () => {
  assert.equal(optimizeAllocation({ quantity: 100 }, []), null);
});
