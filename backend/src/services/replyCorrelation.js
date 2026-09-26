function extractReferenceCode(text) {
  return String(text || '').toUpperCase().match(/\bPSK-[A-Z0-9]{4}\b/)?.[0] || null;
}

async function correlateReply(messageText, senderPhone, { findProcurement, listDispatches, normalizePhone }) {
  const code = extractReferenceCode(messageText);
  if (!code) return { procurement: null, dispatch: null };
  const procurement = await findProcurement(code);
  if (!procurement || procurement.status === 'completed') return { procurement: null, dispatch: null };
  const matches = (await listDispatches()).filter(log =>
    log.dispatch_id === procurement.id && normalizePhone(log.phone) === normalizePhone(senderPhone));
  return { procurement, dispatch: matches.length === 1 ? matches[0] : null };
}

module.exports = { extractReferenceCode, correlateReply };
