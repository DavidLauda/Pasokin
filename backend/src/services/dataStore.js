const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/suppliers.json');

// Helper untuk membaca dan menulis data
function readData() {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading suppliers.json:', error);
    return [];
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing suppliers.json:', error);
  }
}

// Mengambil semua data supplier
function getAllSuppliers() {
  return readData();
}

// Mencari supplier berdasarkan material_category dengan fuzzy/substring matching
function getSuppliersByCategory(category) {
  if (!category) return [];
  const query = category.toLowerCase().trim();
  const suppliers = readData();
  return suppliers.filter(s => s.material_category.toLowerCase().includes(query));
}

// Menambah supplier baru
function addSupplier(supplierData) {
  const suppliers = readData();
  const id = `sup-${Date.now()}`;
  const newSupplier = { id, ...supplierData };
  suppliers.push(newSupplier);
  writeData(suppliers);
  return newSupplier;
}

// Mengupdate data supplier
function updateSupplier(id, supplierData) {
  const suppliers = readData();
  const index = suppliers.findIndex(s => s.id === id);
  if (index !== -1) {
    suppliers[index] = { ...suppliers[index], ...supplierData, id }; // Ensure ID stays same
    writeData(suppliers);
    return suppliers[index];
  }
  return null;
}

// Menghapus supplier
function deleteSupplier(id) {
  const suppliers = readData();
  const filtered = suppliers.filter(s => s.id !== id);
  if (filtered.length !== suppliers.length) {
    writeData(filtered);
    return true;
  }
  return false;
}

module.exports = {
  getAllSuppliers,
  getSuppliersByCategory,
  addSupplier,
  updateSupplier,
  deleteSupplier
};
