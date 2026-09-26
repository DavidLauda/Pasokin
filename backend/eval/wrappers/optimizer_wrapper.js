// Input (stdin):  one optimizer test case (demand_qty, target_kirim_days, weights 0-1, suppliers[...])
// Output (stdout): {"allocation": {name: qty>0}, "returned_null": bool, "total_allocated": n, "rows": [...]}
const toErr = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
console.log = toErr; console.info = toErr; console.warn = toErr;

let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  const c = JSON.parse(raw);
  const { optimizeAllocation } = require('../../src/services/optimizerService');
  const w = c.weights || {};
  const requirement = {
    quantity: c.demand_qty,
    maxBudget: c.max_budget,                 // undefined -> no budget limit
    maxLeadTimeDays: c.target_kirim_days,    // unused by the current code; picked up once a deadline filter exists
    priority: { cost: (w.cost ?? 0) * 100, speed: (w.speed ?? 0) * 100, risk: (w.reliability ?? 0) * 100 }
  };
  const candidates = (c.suppliers || []).map(s => ({
    id: s.name, name: s.name,
    price_per_unit: s.price,
    max_capacity_qty: s.qty,
    lead_time_days: s.lead_time_days,
    reliability_score: s.reliability_score,
    min_order_qty: s.moq ?? s.min_order_qty ?? 0
  }));
  const out = optimizeAllocation(requirement, candidates);
  const rows = out?.recommended_allocations || [];
  const allocation = Object.fromEntries(rows.filter(r => r.qty > 0).map(r => [r.name, r.qty]));
  process.stdout.write(JSON.stringify({
    allocation, returned_null: out == null,
    total_allocated: rows.reduce((s, r) => s + (r.qty || 0), 0), rows
  }));
});
