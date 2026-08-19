async function runTest() {
  const reqPayload = {
    requirement: {
      materialName: "Baja Ringan",
      quantity: 60000,
      unit: "batang",
      maxBudget: 5000000000,
      targetDeliveryDate: "2026-08-25T00:00:00.000Z"
    },
    allocations: [
      {
        supplier_id: "sup-202",
        name: "PT Besi Bangun Nusantara",
        qty: 50000,
        cost: 3100000000,
        phone: "628777777777",
        lead_time_days: 5
      }
    ],
    companyName: "PT Demo Test"
  };

  console.log("1. Dispatching RFQ (to populate dispatchLog)...");
  await fetch("http://localhost:4000/api/dispatch-wa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqPayload)
  });

  console.log("\n2. Simulating CONFIRMED reply...");
  const confRes = await fetch("http://localhost:4000/api/wa-replies/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "628777777777", style: "confirmed" })
  });
  const confData = await confRes.json();
  console.log("Confirmed Reply:", JSON.stringify(confData, null, 2));

  console.log("\n3. Simulating NEGOTIATE reply...");
  const negRes = await fetch("http://localhost:4000/api/wa-replies/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "628777777777", style: "negotiate" })
  });
  const negData = await negRes.json();
  console.log("Negotiate Reply:", JSON.stringify(negData, null, 2));
}

runTest().catch(console.error);
