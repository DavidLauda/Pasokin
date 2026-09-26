function extractReferenceCode(text) {
  return String(text || '').toUpperCase().match(/\bPSK-[A-Z0-9]{4}\b/)?.[0] || null;
}

async function correlateReply(messageText, senderPhone, {
  findProcurement, findProcurementById, listDispatches, normalizePhone
}) {
  const code = extractReferenceCode(messageText);
  const logs = await listDispatches();
  const senderLogs = logs.filter(log => normalizePhone(log.phone) === normalizePhone(senderPhone));
  const uniqueLogs = [...new Map(senderLogs.map(log => [`${log.dispatch_id}:${log.supplier_id}`, log])).values()];
  if (code) {
    const procurement = await findProcurement(code);
    if (!procurement || procurement.status === 'completed') return { procurement: null, dispatch: null };
    const matches = uniqueLogs.filter(log => log.dispatch_id === procurement.id);
    return matches.length === 1
      ? { procurement, dispatch: matches[0] }
      : { procurement: null, dispatch: null };
  }

  // Replies normally omit the RFQ code. Match by phone only when it identifies
  // exactly one supplier in one active procurement; otherwise leave it unmatched.
  if (!findProcurementById) return { procurement: null, dispatch: null };
  const activeMatches = [];
  for (const log of uniqueLogs) {
    const procurement = await findProcurementById(log.dispatch_id);
    if (procurement && procurement.status !== 'completed') activeMatches.push({ procurement, dispatch: log });
  }
  return activeMatches.length === 1 ? activeMatches[0] : { procurement: null, dispatch: null };
}

module.exports = { extractReferenceCode, correlateReply };
