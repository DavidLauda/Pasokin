const { GoogleGenAI } = require('@google/genai');
const configService = require('./configService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function heuristicParser(rawInput) {
    const defaultDate = new Date();
    const lowerInput = rawInput.toLowerCase();
    
    if (lowerInput.includes('bulan depan')) {
        defaultDate.setMonth(defaultDate.getMonth() + 1);
    } else if (lowerInput.includes('minggu depan')) {
        defaultDate.setDate(defaultDate.getDate() + 7);
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
    
    const qtyMatch = lowerInput.match(/(\d+[,.]?\d*)\s*(kg|batang|meter|ton)/i);
    if (qtyMatch) {
        parsed.quantity = parseFloat(qtyMatch[1].replace(/,/g, ''));
        parsed.unit = qtyMatch[2];
    }
    
    const budgetMatch = lowerInput.match(/(rp|idr|budget|maksimal)\s*(\d+[,.]?\d*)/i);
    if (budgetMatch) {
        let budget = parseFloat(budgetMatch[2].replace(/[,.]/g, ''));
        if (budget < 1000) budget *= 1000000;
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
            model: 'gemini-1.5-flash',
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
            model: 'gemini-1.5-flash',
            contents: prompt
        });

        return response.text;
    } catch (e) {
        console.error("Gemini reasoning failed", e);
        return fallbackReasoning;
    }
}

async function generateWAMessagesForAllocations(allocations, requirement, companyName = "Tim Procurement [Nama Perusahaan Anda]") {
    const targetDate = new Date(requirement.targetDeliveryDate).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    
    const getFallback = (a) => {
        const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(a.cost / a.qty);
        return `Halo ${a.name},\n\nPerkenalkan kami dari${companyName}. Kami bermaksud melakukan Request for Quotation (RFQ) untuk kebutuhan material berikut:\n\n- Material: ${requirement.materialName}\n- Kuantitas: ${a.qty}${requirement.unit}\n- Target Harga (indikatif): ${formattedPrice}/${requirement.unit}\n- Target Pengiriman: ${targetDate}\n\nMohon konfirmasinya apakah stok tersedia dan apakah harga serta jadwal pengiriman tersebut dapat dipenuhi?\n\nTerima kasih atas waktu dan kerja samanya.\n\nSalam,\n${companyName}`;
    };

    console.log("[AI] Generating WA messages in BATCH mode...");

    try {
        const supplierDataList = allocations.map(a => {
            const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(a.cost / a.qty);
            return {
                supplier_id: a.supplier_id,
                name: a.name,
                qty: a.qty,
                formattedPrice: formattedPrice
            };
        });

        const prompt = `Anda adalah asisten pengadaan (Pasokin). Buat pesan WhatsApp RFQ (Request for Quotation) B2B yang formal, sopan, dan profesional dalam Bahasa Indonesia untuk BEBERAPA supplier sekaligus.
Pesan harus ditujukan ke supplier dan menanyakan ketersediaan stok, harga, serta kesanggupan pengiriman.
JANGAN gunakan markdown formatting tebal/miring, buat sederhana untuk dibaca di WhatsApp.
Batas panjang: maksimal 120 kata per pesan. Paragraf pendek.

Data Pengadaan (berlaku untuk semua):
- Material: ${requirement.materialName}
- Target Pengiriman: ${targetDate}
- Pengirim: ${companyName}

Data Masing-masing Supplier:
${JSON.stringify(supplierDataList, null, 2)}

OUTPUT YANG DIHARAPKAN ADALAH JSON ARRAY dengan format:
[
  {
    "supplier_id": "id-supplier-sesuai-data",
    "message": "pesan WA untuk supplier tersebut"
  }
]`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        let responseText = response.text;
        if (responseText.startsWith("\`\`\`json")) {
            responseText = responseText.replace(/\`\`\`json\n?/, "").replace(/\`\`\`\n?$/, "");
        }
        
        const parsed = JSON.parse(responseText);

        return allocations.map(a => {
            const found = parsed.find(p => p.supplier_id === a.supplier_id);
            return {
                supplier_id: a.supplier_id,
                phone: a.phone,
                message: found ? found.message.trim() : getFallback(a)
            };
        });

    } catch (e) {
        console.error("Gemini batch WA message generation failed", e);
        return allocations.map(a => ({
            supplier_id: a.supplier_id,
            phone: a.phone,
            message: getFallback(a)
        }));
    }
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
            model: 'gemini-1.5-flash',
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
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        let responseText = response.text;
        if (responseText.startsWith("\`\`\`json")) {
            responseText = responseText.replace(/\`\`\`json\n?/, "").replace(/\`\`\`\n?$/, "");
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
    classifySupplierReply,
    batchClassifySupplierReplies
};