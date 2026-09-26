# Iteration Cycles

Each cycle: finding → hypothesis → change → rerun of the full suite for that component → result → decision.
Baseline for comparison: `BASELINE.md` (commit `10d0004`).

---

## Cycle 1 — optimizer, parser, triage — 12.13–12.18 WIB

- **Commit:** `8d5558a`
- **Results:** `results/optimizer_cycle1.json`, `results/parser_cycle1.json`, `results/triage_cycle1.json` (+ `_summary.json` each)
- **Scope:** one change set per component, all in the same commit. Each component's suite was rerun in full; components don't share code, so their results can be attributed separately.

### Summary

| Component | Metric | Baseline → Cycle 1 |
| --- | --- | --- |
| Optimizer | Test pass rate | 77.3% → **95.5%** |
| Optimizer | Constraint violation rate | 13.6% → **0%** |
| Parser | Overall pass rate | 80.6% → **88.9%** |
| Parser | maxBudget / targetDeliveryDate | 91.7% / 91.7% → **100% / 94.4%** |
| Triage | False-Confirmed rate | 40.7% → 40.0% (≈ no change) |
| Triage | Missed-confirmation rate | 33.3% → **50.0%** (worse) |
| Triage | Classification accuracy | 60.4% → 58.3% |

---

### Cycle 1a — Optimizer (O1 + O2)

**Finding (Temuan)**
- O1: suppliers whose lead time exceeds the target are still allocated — `late` violations in optimizer_008, 012, 015 (3/22).
- O2: a weight of `0` is replaced by the default — optimizer_013 allocates to the faster supplier B although the buyer set speed weight to 0.

**Hypothesis**
- O1: delivery speed was designed as a *soft criterion* (one of three weighted scores) instead of a *hard constraint*. A late supplier only gets a lower score, and can still win when the cost weight is high (optimizer_008: cheapest supplier wins 800/800 despite arriving late).
- O2: the JavaScript falsy-value pitfall. `priority?.speed || 40` treats a deliberate `0` as "missing". It passes manual testing because normal weights (40, 30…) behave correctly; it only shows up with a test that uses exactly 0.

**Change (Perbaikan)** — `backend/src/services/optimizerService.js`
- Candidates with `lead_time_days > maxLeadTimeDays` are removed before scoring; if none remain, the result is empty/infeasible.
- Weight defaults use `??` instead of `||`.

**Result (Hasil uji)**
- Test pass rate 77.3% → 95.5% (17 → 21 of 22); constraint violations 3 → 0.
- FAIL → PASS: optimizer_008, 012, 015 (O1), optimizer_013 (O2)
- PASS → FAIL: none
- Still failing: optimizer_021 (O3, MOQ trap — not addressed in this cycle).

**Decision:** keep.

---

### Cycle 1b — Parser (P1 + P2 + P4)

**Finding (Temuan)**
- P1: when no budget is given, Gemini returns `maxBudget: 0` instead of `null` (parser_029, 032, 037).
- P2: urgency words don't affect the deadline — "yang penting cepet" gets the prompt's 7-day default (parser_037); "minggu ini juga" resolved to next Monday (parser_009).
- P4: units are not normalised — "kilogram" returned instead of `kg` (parser_031).

**Hypothesis**
- P1: the JSON shape in the prompt requires `maxBudget` to be a number, so the model has no valid way to say "not given" and falls back to `0`.
- P2: the prompt only defines one default (7 days when no date is given) and no rules for urgency or "this week" expressions — date phrases were handled as they came up, not from a systematic list of how Indonesian buyers express urgency.
- P4: there is no normalisation step after parsing; units are passed through exactly as the buyer typed them.

**Change (Perbaikan)** — `backend/src/services/geminiService.js` (`parseRequirementIntent` prompt / post-processing)
- Allow `maxBudget: null` when no budget is stated.
- Add rules for urgency words and "this week" expressions.
- Unit normalisation.

**Result (Hasil uji)**
- Overall pass rate 80.6% → 88.9% (29 → 32 of 36). maxBudget 91.7% → 100%, targetDeliveryDate 91.7% → 94.4%.
- FAIL → PASS: parser_029, 032, 037 (P1, null budget), parser_009 and parser_037 (P2, dates)
- **PASS → FAIL (regression): parser_011** — "kirim 10 hari lagi" from Wed 14 Oct now resolves to 28 Oct instead of 24 Oct. 28 Oct is exactly 10 *working* days later, so the new date rules are most likely being over-applied: plain "hari" is now read as "hari kerja".
- **P4 not effective:** parser_031 still returns `kilogram`. The normalisation does not cover this spelling.
- Unchanged: parser_014 (test-case error, see `BASELINE.md` — expected offset should be 9; the model's answer is correct) and parser_034 (brand kept in the material name, product decision pending).

**Decision:** keep P1 and P2. Next parser cycle: restrict the working-day rule to explicit "hari kerja" (fix parser_011) and add `kilogram → kg` to the unit normalisation.

---

### Cycle 1c — Triage (deterministic guardrail, T1/T4/T5)

**Finding (Temuan)**
- False-Confirmed rate 40.7% (11 of 27 "confirmed" wrong): price increases confirmed (triage_036, 040), delivery after target confirmed (triage_015, 034, 046), a greeting-only reply confirmed (triage_031), an injected instruction followed (triage_048).

**Hypothesis**
- The architecture has no verification layer after the model: the output of a small model (Gemma 2B, 4-bit) is trusted as-is, without a simple numeric cross-check between its own extracted values and the RFQ.
- Training/serving skew: the v1 adapter was trained on inputs without "Tanggal RFQ dikirim" / "Target kirim", so it never learned to use dates as a decision signal and falls back to surface keywords ("bisa", "oke", "siap").
- Shortcut learning on a small dataset (v1 adapter: 161 rows): copying the RFQ price from the prompt is an easier way to lower training loss than reading the supplier's reply.

**Change (Perbaikan)** — `triage-service/main.py`
- Guardrail after the model: if the extracted price is above the RFQ price, the quantity is below the request, the lead time is past the target, or the reply contains no numbers → force `needs_manual_review`. It can only downgrade `confirmed`, never upgrade.

**Result (Hasil uji)**
- False-Confirmed rate 40.7% → 40.0% (FP 11 → 8, but TP 16 → 12). Missed-confirmation rate 33.3% → **50.0%**. Classification accuracy 60.4% → 58.3%.
- Extraction is identical to the baseline (same model, same adapter) — only the classification layer changed.
- Class-level flips (computed from the results files; cell 11 only compares overall pass, which didn't change):
  - FAIL → PASS: triage_044, 046, 048
  - **PASS → FAIL: triage_005, 012, 016, 043** — all correct confirmations blocked by the lead-time rule, because the model extracted a wrong lead time (15 or 30 days instead of 2, 4, 14, 1).
- Still false-confirmed (8): triage_014, 015, 022, 031, 034, 036, 040, 047.

**Analysis — why the guardrail didn't help**
The guardrail checks the model's **extracted** numbers, and those numbers are the weak part (price 58.3%, lead time 41.7% accurate):
- **Lead-time rule amplifies extraction errors.** Wrong lead times (15, 30) now block correct confirmations (4 new misses). triage_044 was fixed for the wrong reason: blocked by a hallucinated lead time of 30, not by the price increase.
- **Price rule is blind to price increases** because the model copies the RFQ price (T1): triage_036 and 040 still show the RFQ price, so "price above RFQ" never triggers.
- **"No numbers" rule never triggers** because the model invents numbers from the RFQ context (triage_031, greeting only, still extracted qty/price/lead time).

**Decision:**
- Cycle 2: retrain (T2/T3) so the extraction itself becomes reliable.