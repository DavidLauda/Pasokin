const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const whatsappService = require('../services/whatsappService');
const dispatchLog = require('../services/dispatchLog');
const procurementsStore = require('../services/procurementsStore');
const crypto = require('crypto');

const sleep = ms => new Promise(r => setTimeout(r, ms));

router.post('/', async (req, res) => {
  try {
      const { allocations, requirement, companyName, type } = req.body;

      if (!allocations || !requirement) {
          return res.status(400).json({ error: "Missing allocations or requirement" });
      }

      const isFinalDecision = type === 'final';

      if (isFinalDecision && !req.body.dispatch_id) {
          return res.status(400).json({ error: 'dispatch_id wajib untuk keputusan akhir' });
      }
      if (isFinalDecision && await dispatchLog.isFinalSubmitted(req.body.dispatch_id)) {
          return res.status(409).json({ error: "PO untuk transaksi ini sudah pernah dikirim" });
      }

      // Tahap RFQ awal: satu pesan RFQ per supplier, dicatat ke dispatchLog supaya
      // balasan WhatsApp mereka nanti bisa dicocokkan ke RFQ ini.
      // Tahap final ("Konfirmasi & Kirim PO"): tiap supplier confirmed dapat pesan PO
      // (qty > 0, menang ranking) atau pesan penolakan sopan (qty 0, kalah ranking) —
      // bukan RFQ baru, jadi tidak perlu dicatat ulang ke dispatchLog.
      const messagesToDispatch = isFinalDecision
          ? geminiService.generateFinalDecisionMessages(allocations, requirement, companyName || "Tim Procurement Cerdas")
          : await geminiService.generateWAMessagesForAllocations(allocations, requirement, companyName || "Tim Procurement Cerdas");

      const dispatch_id = isFinalDecision ? req.body.dispatch_id : crypto.randomUUID();
      if (!isFinalDecision) {
          await procurementsStore.create(dispatch_id, requirement, { companyName: companyName || null });
      }
      const results = [];
      let remainingAllocationQty = requirement.quantity > 0 ? requirement.quantity : 0;
      const allocatedQtyBySupplier = new Map();

      if (!isFinalDecision) {
          for (const allocation of allocations) {
              const capacity = Number(allocation.max_capacity_qty ?? requirement.quantity);
              const allocatedQty = Math.min(Math.max(0, capacity), remainingAllocationQty);
              allocatedQtyBySupplier.set(allocation.supplier_id, allocatedQty);
              remainingAllocationQty -= allocatedQty;
          }
      }

      // Kirim satu-satu dengan jeda (bukan blast paralel sekaligus) — blast instan ke
      // banyak nomor adalah pola yang dideteksi sistem anti-spam WhatsApp dan berisiko
      // akun ditandai/dibatasi.
      for (const msgData of messagesToDispatch) {
          const allocRef = allocations.find(a => a.supplier_id === msgData.supplier_id);
          try {
              const isSent = await whatsappService.sendMessage(msgData.phone, msgData.message);
              const status = isSent ? "sent" : "failed";

              if (!isFinalDecision) {
                  await dispatchLog.addLog({
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
                          allocated_qty: allocatedQtyBySupplier.get(msgData.supplier_id) ?? allocRef?.qty,
                          max_capacity_qty: allocRef?.max_capacity_qty,
                          price: allocRef?.price_per_unit || (allocRef?.cost / allocRef?.qty),
                          lead_time_days: allocRef?.lead_time_days
                      },
                      dispatched_at: new Date().toISOString(),
                      status
                  });
              }

              results.push({
                  supplier_id: msgData.supplier_id,
                  name: allocRef?.name,
                  phone: msgData.phone,
                  decision: msgData.decision,
                  status
              });

          } catch (e) {
              results.push({
                  supplier_id: msgData.supplier_id,
                  name: allocRef?.name,
                  phone: msgData.phone,
                  decision: msgData.decision,
                  status: "failed",
                  error: e.message
              });
          }

          // Jeda antar pengiriman (dilewati untuk pesan terakhir)
          if (msgData !== messagesToDispatch[messagesToDispatch.length - 1]) {
              await sleep(1500 + Math.random() * 1000);
          }
      }

      if (isFinalDecision && req.body.dispatch_id) {
          await procurementsStore.createPayments(req.body.dispatch_id, allocations);
          await dispatchLog.markFinalSubmitted(req.body.dispatch_id);
      }

      res.json({ dispatch_id, results });

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses dispatch" });
  }
});

router.get('/history', async (req, res) => {
    try {
        const logs = await dispatchLog.getAllLogs();
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Gagal mengambil riwayat transaksi" });
    }
});

module.exports = router;
