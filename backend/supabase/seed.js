// One-time, idempotent import of the qualifying-round JSON data.
// Runtime requests use Postgres only; this script is never loaded by the app.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/db');

const dataDir = path.join(__dirname, '../src/data');
const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

async function insertMissing(table, key, row) {
  if (await db.findOne(table, key, row[key])) return false;
  await db.insert(table, row);
  return true;
}

async function main() {
  const suppliers = read('suppliers.json');
  const logs = read('dispatchLogs.json');
  const replies = read('replies.json');
  const config = read('config.json');
  const counts = { suppliers: 0, procurements: 0, dispatch_logs: 0,
    supplier_replies: 0, app_settings: 0 };

  for (const supplier of suppliers) {
    const row = { ...supplier, categories: [supplier.material_category] };
    if (await insertMissing('suppliers', 'id', row)) counts.suppliers++;
  }

  const procurementIds = new Set(logs.map(log => log.dispatch_id));
  for (const id of procurementIds) {
    const group = logs.filter(log => log.dispatch_id === id);
    const first = group[0];
    const row = {
      id,
      buyer_info: {},
      parsed_material_summary: first.requirement_snapshot,
      weight_preset_used: first.requirement_snapshot.priority || {},
      status: group.some(log => log.po_sent) ? 'completed' : 'dispatched',
      created_at: first.dispatched_at
    };
    if (await insertMissing('procurements', 'id', row)) counts.procurements++;
  }

  const existingLogs = new Set((await db.list('dispatch_logs', 'dispatched_at'))
    .map(item => `${item.procurement_id}:${item.supplier_id}`));
  const newLogs = [];
  for (const log of logs) {
    const { dispatch_id, ...rest } = log;
    const row = { ...rest, procurement_id: dispatch_id, po_sent: !!log.po_sent };
    if (!existingLogs.has(`${dispatch_id}:${log.supplier_id}`)) newLogs.push(row);
  }
  if (newLogs.length) await db.insertMany('dispatch_logs', newLogs);
  counts.dispatch_logs = newLogs.length;

  const existingReplies = new Set((await db.list('supplier_replies', 'received_at'))
    .map(item => item.id));
  const newReplies = [];
  for (const reply of replies) {
    const { reply_id, dispatch_id, ...rest } = reply;
    const row = {
      ...rest,
      id: reply_id,
      procurement_id: procurementIds.has(dispatch_id) ? dispatch_id : null,
      legacy_dispatch_id: dispatch_id || null
    };
    if (!existingReplies.has(reply_id)) newReplies.push(row);
  }
  for (let index = 0; index < newReplies.length; index += 100) {
    await db.insertMany('supplier_replies', newReplies.slice(index, index + 100));
  }
  counts.supplier_replies = newReplies.length;

  if (await insertMissing('app_settings', 'key', { key: 'demoMode', value: !!config.demoMode })) {
    counts.app_settings++;
  }
  console.log('Imported rows:', counts);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
