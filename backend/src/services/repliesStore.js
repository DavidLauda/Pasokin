const db = require('../db');

function toDb(reply) {
  const { reply_id, dispatch_id, ...rest } = reply;
  return { ...rest, id: reply_id, procurement_id: dispatch_id || null };
}

function fromDb(row) {
  if (!row) return null;
  const { id, procurement_id, legacy_dispatch_id, ...rest } = row;
  return { ...rest, reply_id: id, dispatch_id: procurement_id || legacy_dispatch_id };
}

async function addReply(entry) {
  return fromDb(await db.insert('supplier_replies', toDb(entry)));
}

async function updateReply(replyId, updates) {
  const rows = await db.update('supplier_replies', 'id', replyId, updates);
  return fromDb(rows[0]);
}

async function getReply(replyId) {
  return fromDb(await db.findOne('supplier_replies', 'id', replyId));
}

async function getAllReplies() {
  return (await db.list('supplier_replies', 'received_at')).map(fromDb);
}

module.exports = { addReply, updateReply, getReply, getAllReplies };
