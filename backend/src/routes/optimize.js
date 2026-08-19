const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizerService');
const geminiService = require('../services/geminiService');

router.post('/', async (req, res) => {
  try {
      const { requirement, candidates } = req.body;
      
      if (!requirement || !candidates || candidates.length === 0) {
          return res.status(400).json({ error: "Missing requirement or candidates" });
      }

      // 1. Jalankan optimasi algoritma greedy multi-supplier
      const optimization = optimizerService.optimizeAllocation(requirement, candidates);
      
      if (!optimization || optimization.recommended_allocations.length === 0) {
          return res.status(400).json({ error: "Tidak dapat menemukan alokasi yang valid dengan kriteria yang diberikan." });
      }

      // 2. Dapatkan alasan bahasa natural (AI Reasoning) dari Gemini API
      const ai_reasoning = await geminiService.generateAllocationReasoning(
          requirement,
          optimization.recommended_allocations,
          optimization.savings_estimate_percent
      );

      // Kembalikan sesuai struktur yang dibutuhkan frontend
      res.json({
        total_cost: optimization.total_cost,
        recommended_allocations: optimization.recommended_allocations,
        savings_estimate_percent: optimization.savings_estimate_percent,
        ai_reasoning: ai_reasoning
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses optimasi" });
  }
});

module.exports = router;
