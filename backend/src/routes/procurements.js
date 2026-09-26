const express = require('express');
const db = require('../db');
const procurementsStore = require('../services/procurementsStore');
const dispatchLog = require('../services/dispatchLog');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [procurements, logs] = await Promise.all([
      procurementsStore.list(), dispatchLog.getAllLogs()
    ]);
    const counts = new Map();
    for (const log of logs) {
      const suppliers = counts.get(log.dispatch_id) || new Set();
      suppliers.add(log.supplier_id);
      counts.set(log.dispatch_id, suppliers);
    }
    res.json(procurements.filter(row => row.status !== 'completed').map(row => ({
      id: row.id, reference_code: row.reference_code,
      material_summary: row.material_summary, status: row.status,
      supplier_count: counts.get(row.id)?.size || 0,
      created_at: row.created_at, updated_at: row.updated_at
    })));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  if (req.params.id === 'events') return next();
  try {
    const procurement = await procurementsStore.get(req.params.id);
    if (!procurement) return res.status(404).json({ error: 'Procurement tidak ditemukan' });
    const [logs, messages, allocationResult, suppliersResult] = await Promise.all([
      dispatchLog.getAllLogs(), procurementsStore.messages(procurement.id),
      db.getClient().from('allocations').select('*').eq('procurement_id', procurement.id),
      db.getClient().from('suppliers').select('id,supplier_uuid,name')
    ]);
    if (allocationResult.error) throw new Error(`Supabase: ${allocationResult.error.message}`);
    if (suppliersResult.error) throw new Error(`Supabase: ${suppliersResult.error.message}`);
    const suppliersById = new Map(suppliersResult.data.map(supplier => [supplier.id, supplier]));
    const suppliersByUuid = new Map(suppliersResult.data.map(supplier => [supplier.supplier_uuid, supplier]));
    res.json({ ...procurement,
      dispatched_suppliers: logs.filter(log => log.dispatch_id === procurement.id)
        .map(log => ({ ...log, supplier_uuid: suppliersById.get(log.supplier_id)?.supplier_uuid })),
      allocations: allocationResult.data,
      messages: messages.map(message => ({ ...message,
        supplier_name: suppliersByUuid.get(message.supplier_id)?.name || 'Supplier' })) });
  } catch (error) { next(error); }
});

// The service role subscribes to Supabase; browsers receive status-only events.
// This avoids exposing buyer and payout records with a public Supabase key.
router.get('/events', (req, res, next) => {
  try {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    res.flushHeaders();
    res.write(': connected\n\n');
    res.write('event: ready\ndata: {}\n\n');

    let lastSeen = new Date().toISOString();
    const delivered = new Map();
    const send = row => {
      if (!row.id || delivered.get(row.id) === row.updated_at) return;
      delivered.set(row.id, row.updated_at);
      res.write(`data: ${JSON.stringify({ id: row.id, status: row.status,
        updated_at: row.updated_at })}\n\n`);
    };

    const channel = db.subscribeToProcurements(payload => {
      const row = payload.new || payload.old || {};
      send(row);
    }, status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        res.write('event: degraded\ndata: {}\n\n');
      }
    });

    // Realtime WebSocket may be unavailable in some demo networks. Keep the
    // browser stream live with a database-backed fallback, without browser polling.
    const fallback = setInterval(async () => {
      try {
        const changes = await db.procurementsChangedSince(lastSeen);
        for (const row of changes) {
          send(row);
          if (row.updated_at > lastSeen) lastSeen = row.updated_at;
        }
      } catch (error) {
        console.error('Procurement fallback failed', error);
        res.write('event: degraded\ndata: {}\n\n');
      }
    }, 5000);

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clearInterval(fallback);
      db.unsubscribe(channel).catch(error => console.error('Realtime unsubscribe failed', error));
    });
  } catch (error) { next(error); }
});

module.exports = router;
