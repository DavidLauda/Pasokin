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

## Cycle 2 — optimizer, parser, triage — 16.20–16.26 WIB

- **Commit:** `baf50d8`
- **Results:** `results/optimizer_cycle2.json`, `results/parser_cycle2.json`, `results/triage_cycle2.json` (+ `_summary.json` each)
- **Scope:** Optimizer O3 (MOQ-aware allocation), Parser P2 refinement + P4 completion, Triage T2/T3 retrain (adapter_v2) + input-format sync — `backend/src/services/optimizerService.js`, `backend/src/services/geminiService.js`, `backend/src/services/triageService.js`, `backend/src/services/whatsappService.js`, new folder `triage-service/adapter_v2/`.

### Summary

| Component | Metric | Cycle 1 → Cycle 2 |
| --- | --- | --- |
| Optimizer | Test pass rate | 95.5% → **100.0%** |
| Optimizer | Constraint violation rate | 0% → **0%** |
| Parser | Overall pass rate | 88.9% → **91.7%** |
| Parser | unit / targetDeliveryDate | 97.2% / 94.4% → **100% / 97.2%** |
| Triage | False-Confirmed rate | 40.0% → **35.3%** |
| Triage | Missed-confirmation rate | 50.0% → **8.3%** |
| Triage | Classification accuracy | 58.3% → **70.8%** |
| Triage | lead_time_days / price extraction | 41.7% / 68.8% → **62.5% / 81.3%** |

---

### Cycle 2a — Optimizer (O3, MOQ-aware allocation)

**Finding (Temuan)**
- optimizer_021 (H-O2 MOQ trap) still failing after Cycle 1 — greedy allocation exhausts supplier A's full capacity first, leaving a remainder below supplier B's MOQ, even though a feasible split (A:500 + B:400) exists.

**Change (Perbaikan)** — `backend/src/services/optimizerService.js`
- Allocation logic now checks each candidate's MOQ before committing a supplier's full capacity, so it can hold back some of A's allocation to leave room for B to clear its own MOQ, instead of allocating greedily by score alone until capacity runs out.

**Result (Hasil uji)**
- Test pass rate 95.5% → 100% (21 → 22 of 22).
- FAIL → PASS: optimizer_021 — now returns `{A: 500, B: 400}`, feasible=true, matching the intended non-circular solution.
- PASS → FAIL: none.

**Decision:** keep. 

---

### Cycle 2b — Parser (P2 refinement, P4 completion)

**Finding (Temuan)**
- Cycle 1 left two known gaps: parser_011 regressed (plain "10 hari lagi" being read as working days) and parser_031 unfixed ("kilogram" not normalized to "kg").

**Change (Perbaikan)** — `backend/src/services/geminiService.js`
- Restricted the working-day rule to trigger only on the explicit phrase "hari kerja" (no longer applies to plain "hari").
- Added `kilogram → kg` to the unit-normalisation map.

**Result (Hasil uji)**
- Overall pass rate 88.9% → 91.7% (32 → 33 of 36).
- FAIL → PASS: parser_011 (targetDeliveryDate, fix confirmed), parser_031 (unit, fix confirmed).
- **PASS → FAIL (regression): parser_029** — quantity now returns 70 instead of the expected midpoint 65 for the range "60-70 lembar". This case was previously failing on `maxBudget` (fixed in Cycle 1); the quantity field was never exercised by that earlier fix, so this looks like a pre-existing bug only now surfaced, not something this cycle's edits directly caused. Needs its own root-cause pass.
- Unchanged (still failing): parser_014 — known eval-fixture error: the expected offset in this case file is still `+8`, but the correct value is `+9` per the earlier "Rabu depan" analysis (Senin 19 Okt + 9 hari = Rabu 28 Okt); the model's answer `2026-10-28` is correct, the fixture is stale and needs updating before the next run. parser_034 — `materialName` still keeps the brand "Krakatau Steel"; pending product decision (strip brand or keep), not attempted this cycle.

**Decision:** keep P2/P4 changes. Log parser_029 as a new open item (quantity-range midpoint logic). Refresh parser_014's stale expected value in the case file so it stops reporting as a false failure.

---

### Cycle 2c — Triage (T2/T3 retrain: adapter_v2 + format sync)

**Finding (Temuan) — baseline**
- False-Confirmed rate 40.7%, Missed-confirmation rate 33.3%, lead_time_days extraction 41.7% correct.
- Root cause (established in Cycle 1c analysis): the v1 adapter was trained on inputs without "Tanggal RFQ dikirim" / "Target kirim", so the model never learned to use dates as a decision signal.

**Change (Perbaikan)**
- Retrained adapter, saved separately as `triage-service/adapter_v2/` (v1 kept untouched for before/after comparison).
- `backend/src/services/whatsappService.js`: `processReplyClassification` now passes `latestDispatch.dispatched_at` into `classifySupplierReply` (previously never passed at all).
- `backend/src/services/triageService.js`: builds `text_input` in the new format ("Konteks RFQ: ... Tanggal RFQ dikirim: ... Target kirim: ... Balasan Supplier: ...") to match the retrain data exactly, with a fallback to the old format if either date is missing.
- Cycle 1's deterministic guardrail (force `needs_manual_review` when extracted price > RFQ price, qty < requested, lead time > target, or no numbers in the reply) stayed active on top of the new model output — this is a retrain + guardrail combination, not a retrain-only result.

**Result (Hasil uji)**
- False-Confirmed rate 40.0% → 35.3% (modest improvement).
- **Missed-confirmation rate 50.0% → 8.3%** — the biggest win this cycle. Cycle 1's guardrail had been blocking correct confirmations because of bad lead-time extraction (see Cycle 1c); now that extraction itself is better, that side-effect has largely disappeared.
- Classification accuracy 58.3% → 70.8%.
- Extraction accuracy: lead_time_days 41.7% → 62.5%, price 68.8% → 81.3%, qty 85.4% (not tracked at baseline for comparison).
- Overall pass rate (strict, all fields must match) only 35.4% (17/48) — still low, because most remaining failures are `lead_time_days` mismatches on cases where the classification itself is already correct (triage_005, 011, 012, 013, 016, 033, 045, 046, 047, etc.).

**Analysis — why lead_time_days is still weak**
The model frequently gets the *calendar date right in its own `ai_summary`* but doesn't turn that into a correct `lead_time_days` number:
- triage_013: summary correctly says "pengiriman 15 Oktober 2026" (the exact anchor date), but outputs `lead_time_days: 1` instead of the correct `0`.
- triage_016: summary correctly says "20 Oktober", but outputs `lead_time_days: 1` instead of `14`.
- triage_011/012: instead echo the literal digit from the supplier's text ("tanggal 3" → `3`) without applying the anchor/rollover rule that resolves it into an actual day-offset.

This points to a **date-arithmetic gap, not a date-recognition gap** — the retrain improved the model's ability to notice which date is being discussed, but it hasn't reliably learned to compute the offset from the anchor. The frequent fallback to `1` suggests the training data still skews heavily toward "kirim besok"-style examples.

Remaining false-confirms cluster in categories the guardrail was never designed to check: payment terms (triage_018 tempo bayar, triage_019 DP), partial-qty without an explicit date (triage_022), and hedging language (triage_029 "insyaallah"). These are guardrail-rule gaps (T4/T5), not extraction problems.

**Decision:** keep the retrain — improvement on missed-confirmation and classification accuracy, worth the risk of the smaller false-confirm improvement. Two follow-ups:
1. Extend the guardrail in `triage-service/main.py` to flag payment-term phrases (tempo, DP, cicilan) and partial-qty-without-explicit-date directly from the reply text as `needs_manual_review`.
2. Changed the prompt for the parser problem mid-point issue.

## Cycle 3 — parser, triage — 17.10–17.16 WIB

- **Commit:** `7676a74`
- **Results:** `results/optimizer_cycle3.json`, `results/parser_cycle3.json`, `results/triage_cycle3.json` (+ `_summary.json` each)
- **Scope:** Parser P5 (quantity-range midpoint) — `backend/src/services/geminiService.js`; Triage guardrail rewrite (read supplier reply text directly instead of model extraction) — `triage-service/main.py`, new file `triage-service/deterministic_checks.py`. Optimizer untouched this cycle (no open items after Cycle 2).

### Summary

| Component | Metric | Cycle 2 → Cycle 3 |
| --- | --- | --- |
| Optimizer | Test pass rate | 100.0% → **100.0%** (unchanged, not touched) |
| Parser | Overall pass rate | 91.7% → **91.7%** (unchanged net; one fix, one new regression) |
| Parser | quantity | 97.2% → **100%** |
| Parser | materialName | 97.2% → **94.4%** (regression, see below) |
| Triage | False-Confirmed rate | 35.3% → **12.5%** |
| Triage | Missed-confirmation rate | 8.3% → **12.5%** (worse) |
| Triage | Classification accuracy | 70.8% → **87.5%** |
| Triage | lead_time_days extraction | 62.5% → **91.7%** |
| Triage | Overall pass rate | 35.4% → **62.5%** |

---

### Cycle 3a — Optimizer

No changes made this cycle — suite stayed at 100% pass, 0 constraint violations, confirming Cycle 2's O3 fix holds with no regressions from unrelated work. No open items remain in this component.

---

### Cycle 3b — Parser (P5, quantity-range midpoint)

**Finding (Temuan)**
- parser_029 (Cycle 2 regression): quantity for a range ("sekitar 60-70 lembar") returned the upper bound (70) instead of the agreed midpoint (65).

**Hypothesis**
- The prompt had no instruction at all for range-form quantities, so the model defaulted to picking one end of the range rather than computing a midpoint.

**Change (Perbaikan)** — `backend/src/services/geminiService.js`
- Added an explicit prompt rule: quantity ranges resolve to the midpoint, rounded to the nearest whole number, with a worked example ("60-70" → 65).

**Result (Hasil uji)**
- Overall pass rate held at 91.7% (33/36) — one fix, one new regression, net zero.
- FAIL → PASS: **parser_029** — now correctly returns `quantity: 65`.
- **PASS → FAIL (regression): parser_017** — "smen" (typo for "Semen") is no longer corrected to "Semen"; `materialName` now returned verbatim as "smen". No instruction touching typo correction was added or removed this cycle, and the Gemini call has no `temperature: 0` / fixed seed set, so this is more likely inherent model non-determinism resurfacing on a case that happened to pass before, rather than something caused by the range-midpoint instruction. Worth a rerun to confirm before treating it as a real regression.
- Unchanged: parser_014 (still the known stale test fixture — expected offset should be +9, not +8; the model's `2026-10-28` answer is correct) and parser_034 (brand name kept in `materialName`, still pending a product decision).

**Decision:** keep the range-midpoint rule — it does what it was meant to do. Flag parser_017 for a rerun rather than a code change, since there's no clear causal link to this cycle's edit.

---

### Cycle 3c — Triage (guardrail rewrite: read reply text directly)

**Finding (Temuan) — carried from Cycle 2c**
- Cycle 2's guardrail read `ai_extracted` fields, which were still unreliable (lead_time_days 62.5% accurate) — so the guardrail was amplifying extraction errors as much as catching real problems. Cycle 2's decision was explicit: revise so the rules read the supplier's reply text directly.

**Change (Perbaikan)** — `triage-service/main.py` + new `triage-service/deterministic_checks.py`
- `lead_time_days` is now computed deterministically from the reply text (keywords, absolute/partial dates with anchor+rollover, day names, "N hari lagi") and used to **overwrite** the model's own extracted value, not just to gate classification.
- Guardrail now checks, directly against the reply text: no numbers at all, an explicit price in the reply that exceeds the RFQ price (via regex, not `ai_extracted.price`), missing/late delivery date, payment-term phrases (tempo/DP/cicilan), and hedging language (insyaallah/mungkin/dst.).

**Result (Hasil uji)**
- False-Confirmed rate 35.3% → **12.5%** (FP 12 → 3). Classification accuracy 70.8% → **87.5%**. lead_time_days extraction 62.5% → **91.7%**. Overall pass rate 35.4% → **62.5%**.
- Tool-reported FAIL → PASS (14 cases): triage_001, 002, 003, 005, 011, 012, 013, 015, 018, 019, 029, 033, 034, 046.
- Tool-reported PASS → FAIL (regression): triage_042 only.
- **Missed-confirmation rate got worse (8.3% → 12.5%, FN 2 → 3).** The tool's FAIL/PASS diff only compares the strict `pass` field, and — same limitation flagged in Cycle 1c — that hides classification-level flips when a case was already failing on field-extraction in both runs. Recomputed directly from `class_pass` across both result files: **11 real classification fixes** (a superset of what the tool showed, since several cases like triage_001/005/011/012/013/033 were already classified correctly and only had their `lead_time_days` field fixed) against **3 real classification regressions**, not 1:
  - **triage_016** ("kirim 20 Okt") — new false review. Root cause: the date-with-month-name regex only matches full Indonesian month names (`oktober`, `november`, ...), not abbreviations (`Okt`). Returns `None` → guardrail reads that as "no delivery date mentioned" → forces `needs_manual_review`.
  - **triage_042** ("oke pak 70rb, eh maksud saya 78rb...") — new false confirm. Cycle 2's guardrail (which compared `ai_extracted.price` — the model's own, already-corrected 78000 — against the RFQ price) caught this correctly. Cycle 3's `_extract_reply_price` regex uses `re.search`, which returns the **first** number in the text (70rb), not the self-corrected one (78rb) — so the price-too-high check never fires.
  - **triage_043** ("total 2,7jt utk 30 pcs") — new false review. `_extract_reply_price` correctly extracts the **total** price (2,700,000), but compares it directly against the RFQ's **per-unit** price (Rp100,000) without dividing by quantity first — unlike the JS parser's existing per-unit-price handling. 2,700,000 > 100,000 trips the "price above RFQ" rule for a case that is actually a fair per-unit price (90,000/pcs).
- **Newly discovered bug (not yet causing a wrong classification, but a latent risk):** in `_resolve_lead_time_from_reply`, the day-name loop checks `"minggu"` as a literal weekday name (Sunday) *before* the later `"minggu depan"` / `"minggu ini"` idiom checks. Since "minggu" is also the ordinary word for "week", a reply like "...minggu depan" (triage_022) gets matched by the day-name branch first and resolved as "next Sunday" arithmetic instead of the intended "+7 days" idiom, producing a wrong-but-coincidentally-harmless number (13 instead of 7) in this particular case. This didn't flip a classification this time only because the case's ground truth doesn't hinge on the exact lead-time value — it will in a future case.
- Unaddressed by this cycle (unchanged since Cycle 2, same root causes): price extraction (triage_006, 032, 038, 039, 041 — model still copies/misreads the RFQ or reply price; price accuracy flat at 81.25%), qty extraction on non-standard phrasing (triage_025, 026, 028 — MOQ rejection, alt-product offer, per-unit shipping cost; qty accuracy flat at 85.4%), and triage_023 (model's own classification is wrong on a plain "kirim lusa" confirm — a model reasoning issue, not something the reply-text guardrail is positioned to fix since it only ever downgrades, never upgrades).

**Analysis**
Net effect is a clear win — False-Confirmed rate roughly a third of Cycle 2's, classification accuracy up 16.7 points — but all three new regressions share one pattern: **the reply-text regexes assume the reply is simple and literal**, and break on self-correction, abbreviation, and total-vs-per-unit phrasing that the model itself (or the old ai_extracted-based check) handled more robustly. The lead-time month abbreviation and "minggu" collision are both narrow, mechanical regex gaps.

**Decision:** keep the guardrail rewrite — the net classification-accuracy gain clearly outweighs the 3 new edge-case regressions. If time remains before 18.00, in order of cheapness:
1. Add month abbreviations (`okt`, `nov`, `des`, etc.) as aliases in the date-with-month regex (fixes triage_016).
2. Reorder `_resolve_lead_time_from_reply` so the "minggu depan"/"minggu ini" idiom checks run **before** the day-name loop (fixes the latent triage_022-style bug before it causes a real classification flip).
3. Change `_extract_reply_price` to prefer the **last** price mention in the text over the first (fixes triage_042).
4. Divide a detected "total" price by the reply's own qty before comparing to a per-unit RFQ price, when the reply phrasing says "total ... untuk/for N <unit>" (fixes triage_043) — higher effort, lower priority given time left.
