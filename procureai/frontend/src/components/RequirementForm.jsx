import { useState, useEffect } from 'react';
import { Package, Wallet, Calendar, Scale, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';

export default function RequirementForm({ onResult, onLoadingStart, onError }) {
    const [materialName, setMaterialName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('kg');
    const [budgetStr, setBudgetStr] = useState('');
    const [budgetNum, setBudgetNum] = useState(0);
    const [targetDate, setTargetDate] = useState('');
    
    // Priorities
    const [cost, setCost] = useState(40);
    const [speed, setSpeed] = useState(40);
    const [risk, setRisk] = useState(20);

    const [isLoading, setIsLoading] = useState(false);
    const [categories, setCategories] = useState([]);

    // Fetch categories for datalist
    useEffect(() => {
        client.get('/suppliers')
            .then(res => {
                const cats = [...new Set(res.data.map(s => s.material_category))];
                setCategories(cats);
            })
            .catch(err => console.error("Gagal load categories", err));
    }, []);

    // Format budget as IDR string
    const handleBudgetChange = (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (!rawValue) {
            setBudgetStr('');
            setBudgetNum(0);
            return;
        }
        const num = parseInt(rawValue, 10);
        setBudgetNum(num);
        setBudgetStr(new Intl.NumberFormat('id-ID').format(num));
    };

    // Slider logic
    const handlePriorityChange = (type, value) => {
        let val = parseInt(value, 10);
        if (isNaN(val)) return;

        let rem = 100 - val;
        if (type === 'cost') {
            setCost(val);
            let totalOther = speed + risk;
            if (totalOther === 0) { setSpeed(Math.floor(rem/2)); setRisk(Math.ceil(rem/2)); }
            else {
                setSpeed(Math.round((speed / totalOther) * rem));
                setRisk(100 - val - Math.round((speed / totalOther) * rem));
            }
        } else if (type === 'speed') {
            setSpeed(val);
            let totalOther = cost + risk;
            if (totalOther === 0) { setCost(Math.floor(rem/2)); setRisk(Math.ceil(rem/2)); }
            else {
                setCost(Math.round((cost / totalOther) * rem));
                setRisk(100 - val - Math.round((cost / totalOther) * rem));
            }
        } else {
            setRisk(val);
            let totalOther = cost + speed;
            if (totalOther === 0) { setCost(Math.floor(rem/2)); setSpeed(Math.ceil(rem/2)); }
            else {
                setCost(Math.round((cost / totalOther) * rem));
                setSpeed(100 - val - Math.round((cost / totalOther) * rem));
            }
        }
    };

    const getTodayStr = () => {
        return new Date().toISOString().split('T')[0];
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!materialName || !quantity || budgetNum <= 0 || !targetDate) {
            toast.error("Mohon lengkapi semua field dengan benar.");
            return;
        }

        const qtyNum = parseFloat(quantity);
        if (qtyNum <= 0) {
            toast.error("Kuantitas harus lebih dari 0.");
            return;
        }

        const payload = {
            materialName,
            quantity: qtyNum,
            unit,
            maxBudget: budgetNum,
            targetDeliveryDate: new Date(targetDate).toISOString(),
            priority: { cost, speed, risk }
        };

        setIsLoading(true);
        if (onLoadingStart) onLoadingStart();
        const toastId = toast.loading("Mencari supplier potensial...");

        try {
            // 1. Source
            const sourceRes = await client.post('/source', payload);
            const candidates = sourceRes.data.candidates;
            
            if (!candidates || candidates.length === 0) {
                toast.error("Tidak ada supplier yang memenuhi kriteria (terutama batas waktu pengiriman).", { id: toastId });
                setIsLoading(false);
                if (onError) onError();
                return;
            }

            toast.loading("Mengoptimasi alokasi ke " + candidates.length + " supplier...", { id: toastId });
            
            // 2. Optimize
            const optimizeRes = await client.post('/optimize', {
                requirement: payload,
                candidates: candidates
            });

            toast.success("Optimasi selesai!", { id: toastId });
            
            if (onResult) {
                onResult({
                    requirement: payload,
                    candidates: candidates,
                    optimization: optimizeRes.data
                });
            }

        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.error || "Gagal memproses pengadaan.", { id: toastId });
            if (onError) onError();
        } finally {
            setIsLoading(false);
        }
    };

    const applyPreset = (mat, q, b) => {
        setMaterialName(mat);
        setQuantity(q);
        setBudgetStr(new Intl.NumberFormat('id-ID').format(b));
        setBudgetNum(b);
    };

    return (
        <div className="w-full bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2"><Package className="h-5 w-5 text-amber-500"/> Detail Permintaan</h2>
                    <p className="text-slate-500 text-xs mt-0.5 font-medium">Isi form atau gunakan preset cepat</p>
                </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                
                {/* Presets */}
                <div className="flex flex-wrap gap-2 mb-2">
                    <button type="button" onClick={() => applyPreset('Baja Ringan', 10000, 50000000)} className="px-3 py-1.5 text-xs font-bold rounded-full bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600 border border-slate-200 shadow-sm transition-colors">
                        + Baja Ringan 10k
                    </button>
                    <button type="button" onClick={() => applyPreset('Semen Portland', 500, 25000000)} className="px-3 py-1.5 text-xs font-bold rounded-full bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600 border border-slate-200 shadow-sm transition-colors">
                        + Semen 500 Sak
                    </button>
                    <button type="button" onClick={() => applyPreset('Besi Beton', 5000, 80000000)} className="px-3 py-1.5 text-xs font-bold rounded-full bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600 border border-slate-200 shadow-sm transition-colors">
                        + Besi Beton 5k
                    </button>
                </div>
                
                {/* Material Name */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nama Material</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Package className="h-5 w-5 text-amber-500" />
                        </div>
                        <input
                            type="text"
                            list="category-suggestions"
                            value={materialName}
                            onChange={e => setMaterialName(e.target.value)}
                            className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                            placeholder="Contoh: Baja Ringan"
                            required
                        />
                        <datalist id="category-suggestions">
                            {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                </div>

                {/* Qty & Unit */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kuantitas</label>
                        <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                            placeholder="1000"
                            required
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Satuan</label>
                        <select 
                            value={unit}
                            onChange={e => setUnit(e.target.value)}
                            className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50/50 text-slate-900 font-medium transition-all appearance-none"
                        >
                            <option value="kg">kg</option>
                            <option value="ton">ton</option>
                            <option value="batang">batang</option>
                            <option value="meter">meter</option>
                            <option value="pcs">pcs</option>
                        </select>
                    </div>
                </div>

                {/* Budget */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Batas Anggaran (Maksimal)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Wallet className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
                            <span className="text-slate-500 font-bold">Rp</span>
                        </div>
                        <input
                            type="text"
                            value={budgetStr}
                            onChange={handleBudgetChange}
                            className="pl-[4.5rem] w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 font-bold bg-slate-50/50 transition-all"
                            placeholder="30.000.000"
                            required
                        />
                    </div>
                </div>

                {/* Delivery Date */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Tanggal Pengiriman</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar className="h-5 w-5 text-amber-500" />
                        </div>
                        <input
                            type="date"
                            min={getTodayStr()}
                            value={targetDate}
                            onChange={e => setTargetDate(e.target.value)}
                            className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                            required
                        />
                    </div>
                </div>

                {/* Priorities */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-5">
                        <Scale className="h-5 w-5 text-amber-500" />
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Prioritas AI (Total: 100%)</h3>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                                <span>Menekan Biaya</span>
                                <span>{cost}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={cost} onChange={(e) => handlePriorityChange('cost', e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                                <span>Kecepatan Pengiriman</span>
                                <span>{speed}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={speed} onChange={(e) => handlePriorityChange('speed', e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                                <span>Keandalan (Minimal Risiko)</span>
                                <span>{risk}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={risk} onChange={(e) => handlePriorityChange('risk', e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"/>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-xl shadow-amber-500/20 text-base font-extrabold text-white bg-amber-400 hover:bg-amber-500 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                                Menjalankan AI...
                            </>
                        ) : (
                            "Kirim Permintaan & Sortir AI"
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
