// Input (stdin):  {"input": "...", "message_date": "YYYY-MM-DD"}
// Output (stdout): {"result": <parseRequirementIntent output>, "method": "gemini" | "heuristic" | "error"}
const path = require('path');

// Keep stdout clean for the JSON result: all logs go to stderr (set up BEFORE loading anything).
const toErr = (...a) => process.stderr.write(a.map(String).join(' ') + '\n');
let fellBack = false;
console.log = toErr; console.info = toErr; console.warn = toErr;
console.error = (...a) => { if (a.some(x => String(x).includes('falling back'))) fellBack = true; toErr(...a); };
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true }); } catch (_) {}

let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', async () => {
  const c = JSON.parse(raw);
  // Freeze "today" at the case's message_date (09:00 WIB) so relative dates
  // ("besok", "rabu depan", "tanggal 30") are reproducible on any run day.
  const RealDate = Date;
  const fixed = new RealDate(`${c.message_date}T09:00:00+07:00`).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  global.Date = FixedDate;

  const { parseRequirementIntent } = require('../../src/services/geminiService');
  try {
    const result = await parseRequirementIntent(c.input);
    process.stdout.write(JSON.stringify({ result, method: fellBack ? 'heuristic' : 'gemini' }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ result: null, method: 'error', error: e.message }));
  }
});
