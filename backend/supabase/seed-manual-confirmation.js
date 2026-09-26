// Standalone Orang B demo seed. Run only after Orang A's shared schema is live.
// It never changes the shared schema or selects a production supplier implicitly.
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/db');

async function main() {
  const client = db.getClient();
  const { data: existing, error: existingError } = await client.from('procurements')
    .select('id,reference_code').eq('reference_code', 'PSK-TEST').maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    console.log(`Dummy procurement already exists: ${existing.id}`);
    return;
  }

  const { data: suppliers, error: supplierError } = await client.from('suppliers').select('id').limit(100);
  if (supplierError) throw supplierError;
  const supplier = suppliers.find(row => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.id));
  if (!supplier) throw new Error('No UUID supplier exists yet. Wait for the shared schema and seed one supplier first.');

  const { data, error } = await client.from('procurements').insert({
    id: crypto.randomUUID(),
    reference_code: 'PSK-TEST',
    material_summary: 'Baja Ringan 10.000 kg',
    status: 'needs_manual_review',
    negotiated_supplier_id: supplier.id
  }).select('id,reference_code').single();
  if (error) throw error;
  console.log(`Dummy procurement created: ${data.id} (${data.reference_code})`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
