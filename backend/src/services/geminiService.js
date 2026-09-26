const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

// Format angka Indonesia: "." adalah pemisah ribuan, "," adalah pemisah desimal
// (kebalikan dari format Inggris yang dipahami parseFloat secara default).
function parseIndoNumber(numStr) {
    return parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
}

const QTY_UNIT_WORDS = 'kg|ton|batang|meter|pcs|pieces|unit|lembar|dus|karung|sak|liter|roll|gulung|buah|pack|box|kardus|m2|m3';
const BUDGET_KEYWORDS = /rp|idr|budget|anggaran|maksimal/i;

// P2: "N hari kerja" cuma menghitung Senin-Jumat (skip Sabtu-Minggu)
function addBusinessDays(date, n) {
    let remaining = n;
    while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay(); // 0 = Minggu, 6 = Sabtu
        if (day !== 0 && day !== 6) remaining--;
    }
    return date;
}

// P2: "akhir bulan" (bulan berjalan atau bulan depan lewat monthOffset).
// Pakai setMonth(..., 0) di atas SALINAN date (bukan constructor Y/M/D baru),
// supaya jam-menit-detik aslinya ikut kebawa -- constructor Y/M/D mereset ke
// tengah malam local time, yang bisa geser mundur 1 hari kalau dibandingkan
// sebagai tanggal UTC (timezone WIB = UTC+7).
function lastDayOfMonth(date, monthOffset = 0) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + monthOffset + 1, 0);
    return d;
}

// P2: "minggu ini juga" / "akhir minggu ini" = Minggu di minggu berjalan
function nextSunday(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Minggu
    d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
    return d;
}

function heuristicParser(rawInput) {
    let defaultDate = new Date();
    const lowerInput = rawInput.toLowerCase();

    // Terima "N hari/minggu/bulan", dengan atau tanpa akhiran "lagi"/"kedepan"/"ke depan"
    const hariKerjaMatch = lowerInput.match(/(\d+)\s*hari\s*kerja\b/);
    const bulanMatch = lowerInput.match(/(\d+)\s*bulan(?:\s*(?:lagi|kedepan|ke depan))?\b/);
    const mingguMatch = lowerInput.match(/(\d+)\s*minggu(?:\s*(?:lagi|kedepan|ke depan))?\b/);
    const hariMatch = lowerInput.match(/(\d+)\s*hari(?:\s*(?:lagi|kedepan|ke depan))?\b/);

    if (hariKerjaMatch) {
        // P2: hitung hari kerja saja, bukan hari kalender
        defaultDate = addBusinessDays(defaultDate, parseInt(hariKerjaMatch[1], 10));
    } else if (lowerInput.includes('sebelum akhir bulan depan')) {
        // P2: harus dicek sebelum 'bulan depan' generik di bawah
        defaultDate = lastDayOfMonth(defaultDate, 1);
    } else if (bulanMatch) {
        defaultDate.setMonth(defaultDate.getMonth() + parseInt(bulanMatch[1], 10));
    } else if (mingguMatch) {
        defaultDate.setDate(defaultDate.getDate() + parseInt(mingguMatch[1], 10) * 7);
    } else if (hariMatch) {
        defaultDate.setDate(defaultDate.getDate() + parseInt(hariMatch[1], 10));
    } else if (lowerInput.includes('bulan depan')) {
        defaultDate.setMonth(defaultDate.getMonth() + 1);
    } else if (lowerInput.includes('minggu depan')) {
        defaultDate.setDate(defaultDate.getDate() + 7);
    } else if (lowerInput.includes('akhir bulan')) {
        // P2: tanggal terakhir bulan berjalan
        defaultDate = lastDayOfMonth(defaultDate, 0);
    } else if (lowerInput.includes('minggu ini juga') || lowerInput.includes('akhir minggu ini')) {
        // P2: hari Minggu di minggu berjalan
        defaultDate = nextSunday(defaultDate);
    } else if (lowerInput.includes('lusa')) {
        defaultDate.setDate(defaultDate.getDate() + 2);
    } else if (lowerInput.includes('secepatnya') || lowerInput.includes('asap') || lowerInput.includes('besok')) {
        // P2: "secepatnya"/"asap" disamakan dengan "besok" (+1 hari)
        defaultDate.setDate(defaultDate.getDate() + 1);
    } else if (lowerInput.includes('hari ini')) {
        // do nothing, keep today
    } else {
        // default 7 hari jika tidak ada keterangan
        defaultDate.setDate(defaultDate.getDate() + 7);
    }

    const parsed = {
        materialName: "Aluminium Grade-A",
        quantity: 1000,
        unit: "kg",
        maxBudget: null, // P1: default null, bukan angka tebakan -- diisi di bawah kalau memang disebutkan
        targetDeliveryDate: defaultDate.toISOString(),
        priority: { cost: 40, speed: 40, risk: 20 }
    };

    if (lowerInput.includes('baja')) parsed.materialName = "Baja Ringan";
    if (lowerInput.includes('kain') || lowerInput.includes('katun')) parsed.materialName = "Kain Katun";

    const qtyWithUnit = lowerInput.match(new RegExp(`(\\d+(?:[.,]\\d+)*)\\s*(${QTY_UNIT_WORDS})\\b`, 'i'));
    if (qtyWithUnit) {
        parsed.quantity = parseIndoNumber(qtyWithUnit[1]);
        parsed.unit = qtyWithUnit[2];
    } else {
        // Satuan tidak dikenali: ambil angka pertama yang bukan bagian dari frasa budget
        const numberMatches = [...lowerInput.matchAll(/\d+(?:[.,]\d+)*/g)];
        const qtyNumber = numberMatches.find(m => {
            const context = lowerInput.slice(Math.max(0, m.index - 12), m.index);
            return !BUDGET_KEYWORDS.test(context);
        });
        if (qtyNumber) {
            parsed.quantity = parseIndoNumber(qtyNumber[0]);
        }
    }

    // P1: kalau tidak ada angka budget disebut sama sekali, maxBudget tetap null
    // (sudah di-set di object literal di atas) -- tidak pernah ditebak.
    const budgetMatch = lowerInput.match(/(?:rp|idr|budget|anggaran|maksimal)\s*(\d+(?:[.,]\d+)*)\s*(ribu|rb|juta|jt|miliar|milyar)?/i);
    if (budgetMatch) {
        let budget = parseIndoNumber(budgetMatch[1]);
        const unit = budgetMatch[2]?.toLowerCase();
        if (unit === 'ribu' || unit === 'rb') budget *= 1000;
        else if (unit === 'juta' || unit === 'jt') budget *= 1000000;
        else if (unit === 'miliar' || unit === 'milyar') budget *= 1000000000;
        else if (budget < 1000) budget *= 1000000; // angka kecil tanpa satuan eksplisit diasumsikan "juta"

        // P4: budget per-unit (mis. "65rb per sak" untuk 300 sak) dikali qty jadi
        // total budget, bukan disimpan apa adanya sebagai angka per-unit.
        const afterBudget = lowerInput.slice(
            budgetMatch.index + budgetMatch[0].length,
            budgetMatch.index + budgetMatch[0].length + 20
        );
        const perUnitMatch = afterBudget.match(new RegExp(`^\\s*(?:/|per)\\s*(?:${QTY_UNIT_WORDS}|unit)\\b`, 'i'));
        if (perUnitMatch) {
            budget *= parsed.quantity;
        }

        parsed.maxBudget = budget;
    }

    return parsed;
}

async function parseRequirementIntent(rawInput) {
    console.log("[AI] Parsing requirement intent using Gemini for:", rawInput);
    
    try {
        const todayStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const prompt = `Parse the following raw material requirement into a JSON object with this exact shape:
{
  "materialName": "string",
  "quantity": "number",
  "unit": "string",
  "maxBudget": "number",
  "targetDeliveryDate": "ISO date string",
  "priority": {
    "cost": "number (0-100)",
    "speed": "number (0-100)",
    "risk": "number (0-100)"
  }
}
The priority values must sum to 100. If priorities are not specified, assign a balanced default (e.g. 40, 40, 20). 
IMPORTANT CONTEXT:
- Today's date is: ${todayStr}.
- Resolve any relative dates in the prompt (e.g., "bulan depan", "besok", "minggu depan") accurately based on today's date.
- If target delivery date is completely unspecified, use a date 7 days from today.
- "secepatnya" or "asap" means +1 day from today (same as "besok").
- "X hari kerja" (business days) means count only Monday-Friday, skipping Saturdays and Sundays.
- "akhir bulan" (without "depan") means the last day of the CURRENT month.
- "minggu ini juga" or "akhir minggu ini" means the Sunday of the current week.
- "sebelum akhir bulan depan" means the last day of NEXT month.
- If no budget/price figure is mentioned anywhere in the input, set "maxBudget" to null -- do not guess or assume a default value.
- If the budget is stated as a per-unit price (e.g. "65rb per sak" for a quantity in sak), multiply it by the requested quantity to get the total "maxBudget", not the per-unit figure.

Raw requirement: "${rawInput}"`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        let responseText = response.text;
        if (responseText.startsWith("```json")) {
            responseText = responseText.replace(/```json\n?/, "").replace(/```\n?$/, "");
        }
        
        const parsed = JSON.parse(responseText);
        return parsed;
    } catch (e) {
        console.error("Gemini API failed, falling back to heuristic", e);
        return heuristicParser(rawInput);
    }
}

function generateWAMessage(supplierAllocation, requirement, companyName = "Tim Procurement [Nama Perusahaan Anda]") {
    const targetDate = new Date(requirement.targetDeliveryDate).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(supplierAllocation.cost / supplierAllocation.qty);

    return `Halo ${supplierAllocation.name},

Perkenalkan kami dari ${companyName}. Kami bermaksud melakukan Request for Quotation (RFQ) untuk kebutuhan material berikut:

- Material: ${requirement.materialName}
- Kuantitas: ${supplierAllocation.qty} ${requirement.unit}
- Target Harga (indikatif): ${formattedPrice}/${requirement.unit}
- Target Pengiriman: ${targetDate}

Mohon konfirmasinya apakah stok tersedia dan apakah harga serta jadwal pengiriman tersebut dapat dipenuhi?
Reply chat ini dengan menyebutkan jumlah stok yang tersedia, harga yang ditawarkan, dan kapan barang dapat dikirim. 

Terima kasih atas waktu dan kerja samanya.

Salam,
${companyName}`;
}

function generateWAMessagesForAllocations(allocations, requirement, companyName) {
    return allocations.map((allocation) => {
        const message = generateWAMessage(allocation, requirement, companyName);
        return {
            supplier_id: allocation.supplier_id,
            phone: allocation.phone,
            message: message
        };
    });
}

// Dikirim ke supplier yang MENANG (dapat alokasi qty > 0) saat operator klik "Konfirmasi & Kirim PO".
function generatePOConfirmationMessage(supplierAllocation, requirement, companyName = "Tim Procurement [Nama Perusahaan Anda]") {
    const targetDate = new Date(requirement.targetDeliveryDate).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(supplierAllocation.cost / supplierAllocation.qty);

    return `Halo ${supplierAllocation.name},

Terima kasih atas konfirmasi Anda. Dengan ini kami sampaikan bahwa penawaran Anda KAMI TERIMA dan resmi menjadi Purchase Order (PO):

- Material: ${requirement.materialName}
- Kuantitas: ${supplierAllocation.qty} ${requirement.unit}
- Harga: ${formattedPrice}/${requirement.unit}
- Target Pengiriman: ${targetDate}

Mohon segera diproses. Tim kami akan menghubungi lebih lanjut untuk detail pengiriman dan pembayaran.

Terima kasih atas kerja samanya.

Salam,
${companyName}`;
}

// Dikirim ke supplier yang SUDAH CONFIRMED tapi tidak terpilih (qty = 0 setelah ranking),
// supaya mereka tidak menunggu tanpa kepastian.
function generateRejectionMessage(supplierAllocation, requirement, companyName = "Tim Procurement [Nama Perusahaan Anda]") {
    return `Halo ${supplierAllocation.name},

Terima kasih atas balasan dan penawaran Anda untuk kebutuhan ${requirement.materialName} kami.

Setelah membandingkan seluruh penawaran yang masuk, untuk pesanan kali ini kami belum dapat melanjutkan dengan penawaran Anda karena kebutuhan kami sudah terpenuhi dari pemasok lain.

Kami akan mengingat penawaran Anda untuk kebutuhan berikutnya. Terima kasih atas waktu dan kerja samanya.

Salam,
${companyName}`;
}

// Dipakai saat "Konfirmasi & Kirim PO": tiap supplier confirmed dapat PO (qty > 0)
// atau pesan penolakan sopan (qty === 0, kalah ranking).
function generateFinalDecisionMessages(allocations, requirement, companyName) {
    return allocations.map((allocation) => {
        const isWinner = (allocation.qty || 0) > 0;
        const message = isWinner
            ? generatePOConfirmationMessage(allocation, requirement, companyName)
            : generateRejectionMessage(allocation, requirement, companyName);
        return {
            supplier_id: allocation.supplier_id,
            phone: allocation.phone,
            message,
            decision: isWinner ? "po_confirmed" : "rejected"
        };
    });
}

module.exports = {
    parseRequirementIntent,
    generateWAMessagesForAllocations,
    generateFinalDecisionMessages
};
