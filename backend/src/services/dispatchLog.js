const db = require('../db');

function fromDb(row) {
  const { procurement_id, ...rest } = row;
  return { ...rest, dispatch_id: procurement_id };
}

async function addLog(entry) {
  const { dispatch_id, ...rest } = entry;
  return fromDb(await db.insert('dispatch_logs', { ...rest, procurement_id: dispatch_id }));
}

async function getAllLogs() {
  return (await db.list('dispatch_logs', 'dispatched_at')).map(fromDb);
}

async function isFinalSubmitted(dispatchId) {
  const procurement = await db.findOne('procurements', 'id', dispatchId);
  return procurement?.status === 'completed';
}

async function markFinalSubmitted(dispatchId) {
  await db.update('dispatch_logs', 'procurement_id', dispatchId, { po_sent: true });
  await db.update('procurements', 'id', dispatchId, { status: 'completed' });
}

module.exports = { addLog, getAllLogs, isFinalSubmitted, markFinalSubmitted };
