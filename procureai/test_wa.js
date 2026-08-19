require('dotenv').config({path: './backend/.env'});
const geminiService = require('./backend/src/services/geminiService');

const req = {
  materialName: "Baja Ringan",
  quantity: 50000,
  unit: "batang",
  targetDeliveryDate: "2026-08-25T00:00:00.000Z",
};

const alloc = {
  supplier_id: "sup-202",
  name: "PT Besi Bangun Nusantara",
  qty: 50000,
  cost: 3100000000,
  phone: "628777777777"
};

geminiService.generateWAMessagesForAllocations([alloc], req, "Tim Procurement Cerdas").then(res => {
  console.log(res[0].message);
});
