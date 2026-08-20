import { useState, useEffect } from 'react';
import { Package, Wallet, Calendar, Scale, Loader2, ChevronDown, ChevronUp, Sparkles, X, Check, Edit3, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';

export default function RequirementForm({ onConfirm, onLoadingStart, onError }) {
    // Natural language input
    const [rawInput, setRawInput] = useState('');
    
    // Manual form fields
    const [showManualForm, setShowManualForm] = useState(false);
    const [materialName, setMaterialName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('kg');
    const [budgetStr, setBudgetStr] = useState('');
    const [budgetNum, setBudgetNum] = useState(0);
    const [targetDate, setTargetDate] = useState('');
    
    // Priority buttons
    const [priority, setPriority] = useState('balanced'); // 'cost' | 'speed' | 'balanced'
    
    // State
    const [isLoading, setIsLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    
    // Summary popup
    const [showSummary, setShowSummary] = useState(false);
    const [parsedRequirement, setParsedRequirement] = useState(null);
    const [candidates, setCandidates] = useState([]);

    useEffect(() => {
        client.get('/suppliers')
            .then(res => {
                const cats = [...new Set(res.data.map(s => s.material_category))];
                setCategories(cats);
            })
            .catch(err => console.error("Gagal load categories", err));
    }, []);

    const getPriorityValues = () => {
        switch (priority) {
            case 'cost': return { cost: 60, speed: 20, risk: 20 };
            case 'speed': return { cost: 20, speed: 60, risk: 20 };
            default: return { cost: 40, speed: 40, risk: 20 };
        }
    };

    const handleBudgetChange = (e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (!rawValue) { setBudgetStr(''); setBudgetNum(0); return; }
        const num = parseInt(rawValue, 10);
        setBudgetNum(num);
        setBudgetStr(new Intl.NumberFormat('id-ID').format(num));
    };

    const getTodayStr = () => new Date().toISOString().split('T')[0];

    const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        let payload;
        
        if (showManualForm) {
            // Manual form validation
            if (!materialName || !quantity || budgetNum <= 0 || !targetDate) {
                toast.error("Mohon lengkapi semua field dengan benar.");
                return;
            }
            payload = {
                materialName,
                quantity: parseFloat(quantity),
                unit,
                maxBudget: budgetNum,
                targetDeliveryDate: new Date(targetDate).toISOString(),
                priority: getPriorityValues()
            };
        } else {
            // Natural language
            if (!rawInput.trim()) {
                toast.error("Mohon tuliskan kebutuhan Anda.");
                return;
            }
            payload = {
                rawInput: rawInput.trim(),
                priority: getPriorityValues()
            };
        }

        setIsLoading(true);
        const toastId = toast.loading("AI sedang menganalisis kebutuhan Anda...");

        try {
            const sourceRes = await client.post('/source', payload);
            const { requirement: parsed, candidates: cands } = sourceRes.data;
            
            if (!cands || cands.length === 0) {
                toast.error("Tidak ada supplier yang memenuhi kriteria.", { id: toastId });
                setIsLoading(false);
                return;
            }

            toast.dismiss(toastId);
            setParsedRequirement({ ...parsed, priority: payload.priority || parsed.priority });
            setCandidates(cands);
            setShowSummary(true);
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.error || "Gagal memproses.", { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async () => {
        setShowSummary(false);
        if (onLoadingStart) onLoadingStart();
        
        const toastId = toast.loading("Mengirim RFQ ke " + candidates.length + " supplier...");

        try {
            // Blast RFQ ke SEMUA candidates yang cocok dengan kriteria
            const allCandidatesAllocations = candidates.map(c => ({
                ...c,
                supplier_id: c.id,
                qty: parsedRequirement.quantity, // Tanyakan full kuantitas ke semua supplier
                price: c.price_per_unit || (parsedRequirement.maxBudget / parsedRequirement.quantity)
            }));

            const dispatchRes = await client.post('/dispatch-wa', {
                allocations: allCandidatesAllocations,
                requirement: parsedRequirement,
                companyName: "PT Pasokin Demo"
            });
            
            toast.loading("Mempersiapkan baseline rekomendasi AI...", { id: toastId });

            // Tetap ambil baseline AI reasoning untuk dashboard
            const optimizeRes = await client.post('/optimize', {
                requirement: parsedRequirement,
                candidates: candidates
            });

            toast.success("RFQ berhasil dikirim ke " + allCandidatesAllocations.length + " supplier!", { id: toastId });

            if (onConfirm) {
                onConfirm({
                    requirement: parsedRequirement,
                    candidates: candidates,
                    optimization: optimizeRes.data,
                    dispatch_id: dispatchRes.data.dispatch_id
                });
            }
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.error || "Gagal memproses optimasi.", { id: toastId });
            if (onError) onError();
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    Apa yang kamu butuhkan?
                </h2>
                <p className="text-slate-500 mt-2 font-medium">
                    Tulis dalam bahasa natural, AI kami yang urus sisanya.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Natural Language Input */}
                {!showManualForm && (
                    <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                        <textarea
                            value={rawInput}
                            onChange={(e) => setRawInput(e.target.value)}
                            placeholder="Butuh baja ringan 10.000 kg, budget 300 juta, dikirim minggu depan"
                            rows={4}
                            className="w-full p-6 text-lg font-medium text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-0 border-0"
                        />
                    </div>
                )}

                {/* Manual Form Toggle */}
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setShowManualForm(!showManualForm)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-500 hover:text-amber-600 transition-colors"
                    >
                        {showManualForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {showManualForm ? 'Sembunyikan Form Manual' : 'Isi Manual'}
                    </button>
                </div>

                {/* Manual Form */}
                {showManualForm && (
                    <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6 space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Nama Material</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Package className="h-5 w-5 text-amber-500" />
                                </div>
                                <input
                                    type="text" list="category-suggestions"
                                    value={materialName} onChange={e => setMaterialName(e.target.value)}
                                    className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                                    placeholder="Contoh: Baja Ringan" required={showManualForm}
                                />
                                <datalist id="category-suggestions">
                                    {categories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-bold text-slate-600 mb-1.5">Kuantitas</label>
                                <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)}
                                    className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                                    placeholder="1000" required={showManualForm}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1.5">Satuan</label>
                                <select value={unit} onChange={e => setUnit(e.target.value)}
                                    className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50/50 text-slate-900 font-medium transition-all appearance-none"
                                >
                                    <option value="kg">kg</option><option value="ton">ton</option><option value="batang">batang</option><option value="meter">meter</option><option value="pcs">pcs</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Batas Anggaran</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Wallet className="h-5 w-5 text-amber-500" /></div>
                                <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none"><span className="text-slate-500 font-bold">Rp</span></div>
                                <input type="text" value={budgetStr} onChange={handleBudgetChange}
                                    className="pl-[4.5rem] w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 font-bold bg-slate-50/50 transition-all"
                                    placeholder="30.000.000" required={showManualForm}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Target Pengiriman</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Calendar className="h-5 w-5 text-amber-500" /></div>
                                <input type="date" min={getTodayStr()} value={targetDate} onChange={e => setTargetDate(e.target.value)}
                                    className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                                    required={showManualForm}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Priority Buttons */}
                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6">
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-4">Prioritas</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <button type="button" onClick={() => setPriority('cost')}
                            className={`py-3.5 px-4 rounded-xl text-sm font-bold border-2 transition-all ${priority === 'cost' ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-md shadow-amber-500/10' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}
                        >
                            Prioritaskan Biaya
                        </button>
                        <button type="button" onClick={() => setPriority('speed')}
                            className={`py-3.5 px-4 rounded-xl text-sm font-bold border-2 transition-all ${priority === 'speed' ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-md shadow-amber-500/10' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}
                        >
                            Prioritaskan Kecepatan
                        </button>
                        <button type="button" onClick={() => setPriority('balanced')}
                            className={`py-3.5 px-4 rounded-xl text-sm font-bold border-2 transition-all ${priority === 'balanced' ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-md shadow-amber-500/10' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}
                        >
                            Seimbang
                        </button>
                    </div>
                </div>

                {/* Submit */}
                <button type="submit" disabled={isLoading}
                    className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-xl shadow-amber-500/20 text-base font-extrabold text-white bg-amber-400 hover:bg-amber-500 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200"
                >
                    {isLoading ? (
                        <><Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" /> AI sedang menganalisis...</>
                    ) : (
                        "Cari & Optimalkan Pemasok"
                    )}
                </button>
            </form>

            {/* AI Summary Popup - Editable */}
            {showSummary && parsedRequirement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-amber-500" />
                                Ringkasan AI
                            </h3>
                            <button type="button" onClick={() => setShowSummary(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-500 font-medium">AI telah menganalisis permintaan Anda. Anda bisa merevisi langsung di bawah ini:</p>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Material</label>
                                    <input type="text" value={parsedRequirement.materialName}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, materialName: e.target.value}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Kuantitas</label>
                                        <input type="number" value={parsedRequirement.quantity}
                                            onChange={(e) => setParsedRequirement(prev => ({...prev, quantity: parseFloat(e.target.value) || 0}))}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Satuan</label>
                                        <select value={parsedRequirement.unit}
                                            onChange={(e) => setParsedRequirement(prev => ({...prev, unit: e.target.value}))}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900 appearance-none"
                                        >
                                            <option value="kg">kg</option><option value="ton">ton</option><option value="batang">batang</option><option value="meter">meter</option><option value="pcs">pcs</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Budget Maks (Rp)</label>
                                    <input type="number" value={parsedRequirement.maxBudget}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, maxBudget: parseInt(e.target.value) || 0}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Target Pengiriman</label>
                                    <input type="date" value={parsedRequirement.targetDeliveryDate?.split('T')[0]}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, targetDeliveryDate: new Date(e.target.value).toISOString()}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                                    />
                                </div>
                            </div>
                            
                            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Ditemukan {candidates.length} supplier yang memenuhi kriteria
                                </p>
                                <p className="text-xs text-amber-600 mt-1">Jika dikonfirmasi, AI akan langsung mengirim RFQ ke semua supplier tersebut via WhatsApp.</p>
                            </div>
                        </div>
                        
                        <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3">
                            <button type="button" onClick={() => setShowSummary(false)}
                                className="flex items-center gap-2 px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                <X className="h-4 w-4" /> Batal
                            </button>
                            <button type="button" onClick={handleConfirm}
                                className="flex items-center gap-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-extrabold rounded-xl shadow-lg shadow-amber-500/20 transition-all"
                            >
                                <Check className="h-4 w-4" /> Konfirmasi & Kirim
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
