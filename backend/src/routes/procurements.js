const express = require('express');
const db = require('../db');

const router = express.Router();

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
