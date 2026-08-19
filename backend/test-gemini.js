require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

async function run() {
    const todayStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const rawInput = 'mau baja ringan 1000 kg budget 100jt dikirim bulan depan';
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

    const res = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {responseMimeType: 'application/json'}
    });
    console.log(res.text);
}
run().catch(console.error);
