// src/services/optimizerService.js

function optimizeAllocation(requirement, candidates) {
    if (!candidates || candidates.length === 0) return null;

    // 1. TAHAP PERTAMA: Ambil Bobot Prioritas dari Request
    // Dikonversi menjadi proporsi (sum = 1) untuk perhitungan Weighted Sum Model
    let wCost = (requirement.priority?.cost || 40) / 100;
    let wSpeed = (requirement.priority?.speed || 40) / 100;
    let wRisk = (requirement.priority?.risk || 20) / 100;
    
    // Normalisasi bobot agar jumlah pasti 1 (menghindari error jika input user salah)
    const totalWeight = wCost + wSpeed + wRisk;
    if (totalWeight > 0) {
        wCost /= totalWeight;
        wSpeed /= totalWeight;
        wRisk /= totalWeight;
    }

    // 2. TAHAP KEDUA: Min-Max Normalization (Feature Scaling)
    // Mencari batas atas dan bawah untuk masing-masing kriteria
    const costs = candidates.map(c => c.price_per_unit);
    const speeds = candidates.map(c => c.lead_time_days);
    const risks = candidates.map(c => c.reliability_score);

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs) || minCost + 1; // hindari pembagian nol
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds) || minSpeed + 1;
    const minRisk = Math.min(...risks);
    const maxRisk = Math.max(...risks) || minRisk + 0.1;

    // 3. TAHAP KETIGA: Perhitungan Skor (Scoring)
    const scoredCandidates = candidates.map(c => {
        // Normalisasi Biaya: Lebih murah -> Lebih mendekati 1
        const normCost = 1 - ((c.price_per_unit - minCost) / (maxCost - minCost));
        
        // Normalisasi Kecepatan: Lebih cepat (lead_time kecil) -> Lebih mendekati 1
        const normSpeed = 1 - ((c.lead_time_days - minSpeed) / (maxSpeed - minSpeed));
        
        // Normalisasi Risiko: Reliabilitas lebih tinggi -> Lebih mendekati 1
        const normRisk = (c.reliability_score - minRisk) / (maxRisk - minRisk);

        // Skor akhir: Penjumlahan terbobot (Weighted Sum) dari seluruh parameter
        const score = (wCost * normCost) + (wSpeed * normSpeed) + (wRisk * normRisk);

        return { ...c, score };
    });

    // Urutkan supplier dari skor AI tertinggi ke terendah
    scoredCandidates.sort((a, b) => b.score - a.score);

    // 4. TAHAP KEEMPAT: Greedy Waterfall Allocation
    // Isi kuantitas dari supplier skor TERTINGGI dulu sampai kebutuhan terpenuhi.
    // Supplier peringkat bawah cuma kebagian sisa kebutuhan (kalau ada). SEMUA kandidat
    // tetap ditampilkan di hasil (urut ranking) supaya kelihatan urutannya — begitu
    // kebutuhan sudah penuh, supplier sisanya cuma dapat qty 0, bukan dihilangkan.
    let remainingQty = requirement.quantity > 0 ? requirement.quantity : 1;
    let remainingBudget = requirement.maxBudget || Infinity;
    const allocations = [];

    for (const supplier of scoredCandidates) {
        let qtyToTake = 0;

        if (remainingQty > 0) {
            qtyToTake = Math.min(supplier.max_capacity_qty, remainingQty);

            // Cek constraint MOQ (Minimum Order Quantity): kalau sisa kebutuhan lebih kecil
            // dari MOQ supplier ini, supplier ini tidak kebagian (qty 0), bukan dipaksa over-order.
            if (qtyToTake < supplier.min_order_qty) {
                qtyToTake = 0;
            }

            // Cek Constraint Budget
            if (qtyToTake > 0) {
                const costToTake = qtyToTake * supplier.price_per_unit;
                if (costToTake > remainingBudget) {
                    let maxQtyForBudget = Math.floor(remainingBudget / supplier.price_per_unit);
                    if (maxQtyForBudget < supplier.min_order_qty) {
                        maxQtyForBudget = 0; // Skip if we can't even afford MOQ
                    }
                    qtyToTake = Math.min(qtyToTake, maxQtyForBudget);
                }
            }
        }

        const actualCost = qtyToTake * supplier.price_per_unit;

        allocations.push({
            supplier_id: supplier.id,
            name: supplier.name,
            location: supplier.location,
            price_per_unit: supplier.price_per_unit,
            qty: qtyToTake,
            cost: actualCost,
            lead_time_days: supplier.lead_time_days,
            phone: supplier.phone
        });

        if (qtyToTake > 0) {
            remainingBudget -= actualCost;
            remainingQty -= qtyToTake;
        }
    }

    const totalAllocatedQty = allocations.reduce((sum, a) => sum + a.qty, 0);
    const total_cost = allocations.reduce((sum, a) => sum + a.cost, 0);

    // Hitung persentase untuk frontend (UI donat / pie chart)
    allocations.forEach(a => {
        a.percentage = totalAllocatedQty > 0 ? parseFloat(((a.qty / totalAllocatedQty) * 100).toFixed(1)) : 0;
    });

    // 5. TAHAP KELIMA: Hitung Penghematan (Savings Estimate)
    // Bandingkan dengan biaya jika seluruh kuantitas dibeli dari single termurah yang mampu menyuplai total.
    const validSingleSuppliers = candidates.filter(c => c.max_capacity_qty >= requirement.quantity);
    let baselineCost = 0;
    
    if (validSingleSuppliers.length > 0) {
        // Anggap supplier dengan harga tertinggi dari yang valid sebagai baseline pembanding (kasus terburuk pembelian)
        const highestSingle = validSingleSuppliers.sort((a,b) => b.price_per_unit - a.price_per_unit)[0];
        baselineCost = highestSingle.price_per_unit * totalAllocatedQty;
    } else {
        // Jika tidak ada single supplier, hitung rata-rata harga pasar
        const avgPrice = candidates.reduce((sum, c) => sum + c.price_per_unit, 0) / candidates.length;
        baselineCost = avgPrice * totalAllocatedQty;
    }

    let savings_estimate_percent = 0;
    if (baselineCost > total_cost && baselineCost > 0) {
        savings_estimate_percent = parseFloat((((baselineCost - total_cost) / baselineCost) * 100).toFixed(1));
    }

    return {
        total_cost,
        recommended_allocations: allocations,
        savings_estimate_percent,
        totalAllocatedQty
    };
}

module.exports = { optimizeAllocation };
