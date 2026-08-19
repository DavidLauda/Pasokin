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

    // 4. TAHAP KEEMPAT: Greedy Allocation Algorithm
    let remainingQty = requirement.quantity;
    let remainingBudget = requirement.maxBudget || Infinity;
    const allocations = [];

    if (!remainingQty || remainingQty <= 0) remainingQty = 1;

    for (const supplier of scoredCandidates) {
        if (remainingQty <= 0) break;

        // Tentukan jumlah yang bisa disuplai oleh supplier ini
        // Kita ambil sebanyak-banyaknya hingga kapasitas maksimal mereka, 
        // tapi tidak boleh melebihi sisa qty yang sedang dicari
        let qtyToTake = Math.min(remainingQty, supplier.max_capacity_qty);

        // Cek constraint MOQ (Minimum Order Quantity)
        if (qtyToTake < supplier.min_order_qty) {
            // Jika kebutuhan kita lebih kecil dari MOQ mereka, dan kita SUDAH mengambil 
            // dari supplier lain (ada alokasi sebelumnya), kita skip supplier ini.
            if (allocations.length > 0) continue;
            // Jika ini supplier pertama (belum ada alokasi), paksa naik ke MOQ
            qtyToTake = supplier.min_order_qty;
        }

        const costToTake = qtyToTake * supplier.price_per_unit;

        // Cek Constraint Budget
        if (costToTake > remainingBudget) {
            // Hitung sisa budget cukup untuk berapa qty?
            let maxQtyForBudget = Math.floor(remainingBudget / supplier.price_per_unit);
            
            // Jika budget hanya cukup untuk di bawah MOQ, skip supplier ini
            if (maxQtyForBudget < supplier.min_order_qty) {
                continue;
            }
            
            qtyToTake = Math.min(qtyToTake, maxQtyForBudget);
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

        remainingQty -= qtyToTake;
        remainingBudget -= actualCost;

        // Batasi alokasi ke 3 supplier maksimal untuk menghindari logistik terlalu kompleks
        // Kecuali quantity belum terpenuhi.
        if (allocations.length >= 3 && remainingQty <= 0) {
            break;
        }
    }

    const totalAllocatedQty = allocations.reduce((sum, a) => sum + a.qty, 0);
    const total_cost = allocations.reduce((sum, a) => sum + a.cost, 0);

    // Hitung persentase untuk frontend (UI donat / pie chart)
    allocations.forEach(a => {
        a.percentage = parseFloat(((a.qty / totalAllocatedQty) * 100).toFixed(1));
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
