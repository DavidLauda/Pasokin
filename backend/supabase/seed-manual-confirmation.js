// Standalone demo seed. Run only after Orang A's shared schema is live.
// It never changes the shared schema or selects a production supplier implicitly.
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/db');

async function main() {
  const client = db.getClient();
  const { data: existing, error: existingError } = await client.from('procurements')
    .select('id,reference_code').in('reference_code', ['PSK-TEST', 'PSK-DM02']);
  if (existingError) throw existingError;
  const existingCodes = new Set(existing.map(row => row.reference_code));
  if (existingCodes.size === 2) return console.log('Both demo procurements already exist.');

  let supplier;
  if (!existingCodes.has('PSK-TEST')) {
    const { data: suppliers, error: supplierError } = await client.from('suppliers').select('supplier_uuid').limit(100);
    if (supplierError) throw supplierError;
    supplier = suppliers.find(row => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.supplier_uuid));
    if (!supplier) throw new Error('No supplier_uuid exists yet. Apply the shared schema and seed a supplier first.');
  }

  const rows = [
    { reference_code: 'PSK-TEST', material_summary: 'Baja Ringan 10.000 kg',
      status: 'needs_manual_review', negotiated_supplier_id: supplier?.supplier_uuid,
      weight_preset_used: '{}' },
    { reference_code: 'PSK-DM02', material_summary: 'Semen 500 sak', status: 'parsing',
      weight_preset_used: '{}' }
  ];
  for (const row of rows) {
    if (existingCodes.has(row.reference_code)) continue;
    const { data, error } = await client.from('procurements').insert({
      id: crypto.randomUUID(), ...row
    }).select('id,reference_code').single();
    if (error) throw error;
    console.log(`Demo procurement created: ${data.id} (${data.reference_code})`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
