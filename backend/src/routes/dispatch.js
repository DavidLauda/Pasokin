const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const whatsappService = require('../services/whatsappService');
const dispatchLog = require('../services/dispatchLog');
const crypto = require('crypto');

router.post('/', async (req, res) => {
  try {
      const { allocations, requirement, companyName } = req.body;

      if (!allocations || !requirement) {
          return res.status(400).json({ error: "Missing allocations or requirement" });
      }

      const messagesToDispatch = await geminiService.generateWAMessagesForAllocations(
          allocations, 
          requirement, 
          companyName || "Tim Procurement Cerdas"
      );

      const dispatch_id = crypto.randomUUID();
      const results = [];

      await Promise.allSettled(messagesToDispatch.map(async (msgData) => {
          try {
              const isSent = await whatsappService.sendMessage(msgData.phone, msgData.message);
              const status = isSent ? "sent" : "failed";

              const allocRef = allocations.find(a => a.supplier_id === msgData.supplier_id);

              dispatchLog.addLog({
                  dispatch_id,
                  supplier_id: msgData.supplier_id,
                  name: allocRef?.name,
                  phone: msgData.phone,
                  message_sent: msgData.message,
                  requirement_snapshot: {
                      materialName: requirement.materialName,
                      quantity: requirement.quantity,
                      unit: requirement.unit,
                      maxBudget: requirement.maxBudget,
                      targetDeliveryDate: requirement.targetDeliveryDate
                  },
                  allocation_snapshot: {
                      qty: allocRef?.qty,
                      price: allocRef?.price_per_unit || (allocRef?.cost / allocRef?.qty),
                      lead_time_days: allocRef?.lead_time_days
                  },
                  dispatched_at: new Date().toISOString(),
                  status
              });

              results.push({
                  supplier_id: msgData.supplier_id,
                  name: allocRef?.name,
                  phone: msgData.phone,
                  status
              });

          } catch (e) {
              const allocRef = allocations.find(a => a.supplier_id === msgData.supplier_id);
              results.push({
                  supplier_id: msgData.supplier_id,
                  name: allocRef?.name,
                  phone: msgData.phone,
                  status: "failed",
                  error: e.message
              });
          }
      }));

      res.json({ dispatch_id, results });

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses dispatch" });
  }
});

router.get('/history', (req, res) => {
    try {
        const logs = dispatchLog.getAllLogs();
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Gagal mengambil riwayat transaksi" });
    }
});

module.exports = router;
