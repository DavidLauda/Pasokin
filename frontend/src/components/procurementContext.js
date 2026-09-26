export function createdThisMonth(row, now = new Date()) {
  const created = new Date(row.created_at);
  return !Number.isNaN(created.getTime()) &&
    created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
}

export function monthlyActivity(active, history, details, now = new Date()) {
  const monthlyActive = active.filter(row => createdThisMonth(row, now));
  const monthlyHistory = history.filter(row => createdThisMonth(row, now));
  const byId = new Map([...monthlyActive, ...monthlyHistory].map(row => [row.id, row]));
  const supplierIds = new Set();
  const contacted = log => {
    if (log?.supplier_id && log.status === 'sent') supplierIds.add(log.supplier_id);
  };
  monthlyHistory.forEach(row => (row.suppliers || []).forEach(contacted));
  const detailsComplete = monthlyActive.every(row => details.has(row.id));
  monthlyActive.forEach(row => (details.get(row.id)?.dispatched_suppliers || []).forEach(contacted));
  return {
    created: byId.size,
    completed: [...byId.values()].filter(row => row.status === 'completed').length,
    contacted: detailsComplete ? supplierIds.size : null
  };
}
