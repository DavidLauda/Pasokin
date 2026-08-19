const suppliers = require('../data/suppliers.json');

// Mengambil semua data supplier
function getAllSuppliers() {
  return suppliers;
}

// Mencari supplier berdasarkan material_category dengan fuzzy/substring matching
function getSuppliersByCategory(category) {
  if (!category) return [];
  const query = category.toLowerCase().trim();
  return suppliers.filter(s => s.material_category.toLowerCase().includes(query));
}

module.exports = {
  getAllSuppliers,
  getSuppliersByCategory
};
