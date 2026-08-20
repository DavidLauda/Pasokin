const { GoogleGenAI } = require('@google/genai');
const configService = require('./configService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Format angka Indonesia: "." adalah pemisah ribuan, "," adalah pemisah desimal
// (kebalikan dari format Inggris yang dipahami parseFloat secara default).
function parseIndoNumber(numStr) {
    return parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
}

const QTY_UNIT_WORDS = 'kg|ton|batang|meter|pcs|pieces|unit|lembar|dus|karung|sak|liter|roll|gulung|buah|pack|box|kardus|m2|m3';
const BUDGET_KEYWORDS = /rp|idr|budget|anggaran|maksimal/i;

function heuristicParser(rawInput) {
    const defaultDate = new Date();
    const lowerInput = rawInput.toLowerCase();

    // Terima "N hari/minggu/bulan", dengan atau tanpa akhiran "lagi"/"kedepan"/"ke depan"
    const bulanMatch = lowerInput.match(/(\d+)\s*bulan(?:\s*(?:lagi|kedepan|ke depan))?\b/);
    const mingguMatch = lowerInput.match(/(\d+)\s*minggu(?:\s*(?:lagi|kedepan|ke depan))?\b/);
    const hariMatch = lowerInput.match(/(\d+)\s*hari(?:\s*(?:lagi|kedepan|ke depan))?\b/);

    if (bulanMatch) {
        defaultDate.setMonth(defaultDate.getMonth() + parseInt(bulanMatch[1], 10));
    } else if (mingguMatch) {
        defaultDate.setDate(defaultDate.getDate() + parseInt(mingguMatch[1], 10) * 7);
    } else if (hariMatch) {
        defaultDate.setDate(defaultDate.getDate() + parseInt(hariMatch[1], 10));
    } else if (lowerInput.includes('bulan depan')) {
        defaultDate.setMonth(defaultDate.getMonth() + 1);
    } else if (lowerInput.includes('minggu depan')) {
        defaultDate.setDate(defaultDate.getDate() + 7);
    } else if (lowerInput.includes('lusa')) {
        defaultDate.setDate(defaultDate.getDate() + 2);
    } else if (lowerInput.includes('besok')) {
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
        maxBudget: 30000000,
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

    const budgetMatch = lowerInput.match(/(?:rp|idr|budget|anggaran|maksimal)\s*(\d+(?:[.,]\d+)*)\s*(ribu|juta|jt|miliar|milyar)?/i);
    if (budgetMatch) {
        let budget = parseIndoNumber(budgetMatch[1]);
        const unit = budgetMatch[2]?.toLowerCase();
        if (unit === 'ribu') budget *= 1000;
        else if (unit === 'juta' || unit === 'jt') budget *= 1000000;
        else if (unit === 'miliar' || unit === 'milyar') budget *= 1000000000;
        else if (budget < 1000) budget *= 1000000; // angka kecil tanpa satuan eksplisit diasumsikan "juta"
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

Raw requirement: "${rawInput}"`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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

async function generateAllocationReasoning(requirement, allocations, savingsPercent) {
    const fallbackReasoning = `Berdasarkan analisis algoritma optimasi multi-kriteria kami, kami merekomendasikan pemecahan kuantitas pesanan ini ke beberapa pemasok terpilih untuk mengoptimalkan prioritas pengadaan Anda (Biaya: ${requirement.priority?.cost}%, Kecepatan: ${requirement.priority?.speed}\%, Risiko: ${requirement.priority?.risk}%). Estimasi penghematan yang bisa didapatkan adalah ${savingsPercent}%.`;

    console.log("[AI] Generating reasoning...");

    try {
        const prompt = `Anda adalah asisten AI Pengadaan Barang (Pasokin).
Jelaskan alasan di balik alokasi pemasok (supplier) berikut dalam 3-5 kalimat singkat dan profesional dalam Bahasa Indonesia.
Sebutkan dengan jelas bagaimana alokasi ini menyeimbangkan trade-off antara Biaya (cost), Kecepatan (speed), dan Risiko (risk) sesuai prioritas pengguna.
Gunakan format yang ramah bisnis.

Kebutuhan: ${requirement.quantity} ${requirement.unit}${requirement.materialName}
Prioritas Pengguna: Biaya ${requirement.priority?.cost}%, Kecepatan ${requirement.priority?.speed}\%, Risiko ${requirement.priority?.risk}%
Estimasi Penghematan: ${savingsPercent}%
Alokasi:
${JSON.stringify(allocations, null, 2)}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        return response.text;
    } catch (e) {
        console.error("Gemini reasoning failed", e);
        return fallbackReasoning;
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

async function classifySupplierReply(requirementSnapshot, allocationSnapshot, replyText) {
    console.log("[AI] Classifying supplier reply...");

    try {
        const prompt = `Anda adalah asisten AI (Pasokin). Anda akan diberikan histori penawaran harga (RFQ) dan balasan terbaru dari supplier di WhatsApp.
Tugas Anda mengklasifikasikan balasan tersebut dan mengekstrak informasi.

Konteks RFQ (Yang diminta pembeli):
- Material: ${requirementSnapshot.materialName}
- Kuantitas yang diminta: ${allocationSnapshot.qty} ${requirementSnapshot.unit}
- Target Harga: Rp ${allocationSnapshot.price} per ${requirementSnapshot.unit}
- Target Pengiriman: Maksimal dalam ${allocationSnapshot.lead_time_days} hari (atau setara dengan ${requirementSnapshot.targetDeliveryDate})

Balasan Supplier: "${replyText}"

Analisis balasan supplier dan tentukan apakah mereka:
1. Menyetujui ("confirmed"): secara eksplisit atau implisit menyetujui SELURUH syarat (kuantitas terpenuhi, harga sama atau lebih murah, pengiriman sanggup tepat waktu). Tidak ada modifikasi syarat dari pihak mereka.
2. Memerlukan Negosiasi Manual ("needs_manual_review"): Mereka menawarkan harga lebih tinggi, kuantitas lebih rendah, butuh waktu pengiriman lebih lama, bertanya, atau menolak.

PENTING: Output HARUS berupa JSON murni dengan format berikut:
{
  "classification": "confirmed" | "needs_manual_review",
  "ai_summary": "1 kalimat ringkasan bahasa indonesia kenapa anda memilih klasifikasi ini",
  "ai_extracted": {
    "qty": number (jika mereka menyebut kuantitas yg disanggupi, else null),
    "price": number (jika menyebut harga yg disanggupi, else null),
    "lead_time_days": number (jika menyebut estimasi hari pengiriman, else null)
  }
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
        
        if (parsed.classification !== "confirmed" && parsed.classification !== "needs_manual_review") {
            parsed.classification = "needs_manual_review";
        }
        
        return parsed;

    } catch (e) {
        console.error("Gemini classification failed", e);
        return {
            classification: "needs_manual_review",
            ai_summary: "Terjadi error klasifikasi AI. Butuh review manual.",
            ai_extracted: null
        };
    }
}

async function batchClassifySupplierReplies(requirementSnapshot, repliesData) {
    console.log("[AI] Batch classifying supplier replies...");

    try {
        const prompt = `Anda adalah asisten AI (Pasokin). Anda akan diberikan histori penawaran harga (RFQ) dan balasan terbaru dari BEBERAPA supplier di WhatsApp.
Tugas Anda mengklasifikasikan SETIAP balasan tersebut dan mengekstrak informasinya.

Konteks RFQ (Yang diminta pembeli):
- Material: ${requirementSnapshot.materialName}
- Target Pengiriman: Maksimal ${requirementSnapshot.targetDeliveryDate}

Data Balasan Supplier:
${JSON.stringify(repliesData.map(r => ({
    reply_id: r.reply_id,
    supplier_name: r.supplier_name,
    qty_requested: r.qty_requested + ' ' + requirementSnapshot.unit,
    target_price: 'Rp ' + r.target_price,
    max_lead_time_days: r.lead_time_days,
    reply_text: r.reply_text
})), null, 2)}

Analisis balasan tiap supplier dan tentukan apakah mereka:
1. "confirmed": menyetujui SELURUH syarat (kuantitas terpenuhi, harga sama atau lebih murah, pengiriman sanggup tepat waktu). Tidak ada modifikasi syarat dari pihak mereka.
2. "needs_manual_review": Mereka menawarkan harga lebih tinggi, kuantitas lebih rendah, butuh waktu pengiriman lebih lama, bertanya, menolak, atau tidak ada kejelasan.

PENTING: Output HARUS berupa JSON ARRAY dengan format:
[
  {
    "reply_id": "id-dari-data-input",
    "classification": "confirmed" | "needs_manual_review",
    "ai_summary": "1 kalimat ringkasan bahasa indonesia alasan klasifikasi ini",
    "ai_extracted": {
      "qty": number (jika mereka menyebut kuantitas yg disanggupi, else null),
      "price": number (jika menyebut harga yg disanggupi, else null),
      "lead_time_days": number (jika menyebut estimasi hari pengiriman, else null)
    }
  }
]`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
        
        // Validation
        parsed.forEach(p => {
            if (p.classification !== "confirmed" && p.classification !== "needs_manual_review") {
                p.classification = "needs_manual_review";
            }
        });
        
        return parsed;

    } catch (e) {
        console.error("Gemini batch classification failed", e);
        // Fallback
        return repliesData.map(r => ({
            reply_id: r.reply_id,
            classification: "needs_manual_review",
            ai_summary: "Terjadi error klasifikasi AI. Butuh review manual.",
            ai_extracted: null
        }));
    }
}

module.exports = {
    parseRequirementIntent,
    generateAllocationReasoning,
    generateWAMessagesForAllocations,
    generateFinalDecisionMessages,
    classifySupplierReply,
    batchClassifySupplierReplies
};