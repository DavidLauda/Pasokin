const { GoogleGenAI } = require('@google/genai');
const configService = require('./configService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function heuristicParser(rawInput) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    
    const parsed = {
        materialName: "Aluminium Grade-A",
        quantity: 1000,
        unit: "kg",
        maxBudget: 30000000,
        targetDeliveryDate: defaultDate.toISOString(),
        priority: { cost: 40, speed: 40, risk: 20 }
    };
    
    const lowerInput = rawInput.toLowerCase();
    
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
    if (configService.isDemoMode()) {
        console.log("[Mock] Using heuristic parser for:", rawInput);
        await sleep(1500); // Artificial delay to feel real
        return heuristicParser(rawInput);
    }
    
    try {
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
The priority values must sum to 100. If priorities are not specified, assign a balanced default (e.g. 40, 40, 20). If target delivery date is not specified, use a date 7 days from today.

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
    const fallbackReasoning = `Berdasarkan analisis algoritma optimasi multi-kriteria kami, kami merekomendasikan pemecahan kuantitas pesanan ini ke beberapa pemasok terpilih untuk mengoptimalkan prioritas pengadaan Anda (Biaya: ${requirement.priority?.cost}%, Kecepatan: ${requirement.priority?.speed}%, Risiko: ${requirement.priority?.risk}%). Estimasi penghematan yang bisa didapatkan adalah ${savingsPercent}%.`;

    if (configService.isDemoMode()) {
        await sleep(1500);
        return fallbackReasoning;
    }

    try {
        const prompt = `Anda adalah asisten AI Pengadaan Barang (Pasokin).
Jelaskan alasan di balik alokasi pemasok (supplier) berikut dalam 3-5 kalimat singkat dan profesional dalam Bahasa Indonesia.
Sebutkan dengan jelas bagaimana alokasi ini menyeimbangkan trade-off antara Biaya (cost), Kecepatan (speed), dan Risiko (risk) sesuai prioritas pengguna.
Gunakan format yang ramah bisnis.

Kebutuhan: ${requirement.quantity} ${requirement.unit} ${requirement.materialName}
Prioritas Pengguna: Biaya ${requirement.priority?.cost}%, Kecepatan ${requirement.priority?.speed}%, Risiko ${requirement.priority?.risk}%
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

async function generateWAMessage(supplierAllocation, requirement, companyName = "Tim Procurement [Nama Perusahaan Anda]") {
    const targetDate = new Date(requirement.targetDeliveryDate).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    
    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(supplierAllocation.cost / supplierAllocation.qty);

    const fallbackMessage = `Halo ${supplierAllocation.name},

Perkenalkan kami dari ${companyName}. Kami bermaksud melakukan Request for Quotation (RFQ) untuk kebutuhan material berikut:

- Material: ${requirement.materialName}
- Kuantitas: ${supplierAllocation.qty} ${requirement.unit}
- Target Harga (indikatif): ${formattedPrice}/${requirement.unit}
- Target Pengiriman: ${targetDate}

Mohon konfirmasinya apakah stok tersedia dan apakah harga serta jadwal pengiriman tersebut dapat dipenuhi?

Terima kasih atas waktu dan kerja samanya.

Salam,
${companyName}`;

    if (configService.isDemoMode()) {
        await sleep(500);
        return fallbackMessage;
    }

    try {
        const prompt = `Anda adalah asisten pengadaan (Pasokin). Buat pesan WhatsApp RFQ (Request for Quotation) B2B yang formal, sopan, dan profesional dalam Bahasa Indonesia.
Pesan harus ditujukan ke supplier dan menanyakan ketersediaan stok, harga, serta kesanggupan pengiriman.
JANGAN gunakan markdown formatting tebal/miring, buat sederhana untuk dibaca di WhatsApp.
Batas panjang: maksimal 120 kata. Paragraf pendek.

Data Supplier:
- Nama Supplier: ${supplierAllocation.name}
- Material: ${requirement.materialName}
- Kuantitas diminta: ${supplierAllocation.qty} ${requirement.unit}
- Target Harga penawaran: ${formattedPrice} per ${requirement.unit}
- Target Pengiriman: ${targetDate}

Pengirim: ${companyName}`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt
        });

        return response.text.trim();
    } catch (e) {
        console.error("Gemini WA message generation failed", e);
        return fallbackMessage;
    }
}

async function generateWAMessagesForAllocations(allocations, requirement, companyName) {
    const promises = allocations.map(async (allocation) => {
        const message = await generateWAMessage(allocation, requirement, companyName);
        return {
            supplier_id: allocation.supplier_id,
            phone: allocation.phone,
            message: message
        };
    });
    
    return Promise.all(promises);
}

async function classifySupplierReply(requirementSnapshot, allocationSnapshot, replyText) {
    if (configService.isDemoMode()) {
        await sleep(2000);
        if (replyText.toLowerCase().includes('bisa') || replyText.toLowerCase().includes('oke') || replyText.toLowerCase().includes('siap')) {
            return {
                classification: "confirmed",
                ai_summary: "Supplier menyetujui kuantitas, harga, dan jadwal sesuai permintaan.",
                ai_extracted: {
                    qty: allocationSnapshot.qty,
                    price: allocationSnapshot.price,
                    lead_time_days: allocationSnapshot.lead_time_days
                }
            };
        } else {
            return {
                classification: "needs_manual_review",
                ai_summary: "Supplier tampaknya melakukan negosiasi ulang atau bertanya.",
                ai_extracted: null
            };
        }
    }

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

module.exports = {
    parseRequirementIntent,
    generateAllocationReasoning,
    generateWAMessagesForAllocations,
    classifySupplierReply
};