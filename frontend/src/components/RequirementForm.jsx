import { useState, useEffect, useRef } from 'react';
import { Package, Wallet, Calendar, Loader2, ChevronDown, ChevronUp, Sparkles, X, Check, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';
import WhatsAppStatusModal from './WhatsAppStatusModal';
import SupplierLocationPicker from './SupplierLocationPicker';

export default function RequirementForm({ onConfirm }) {
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
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const deliveryAddressRef = useRef('');
    const [deliveryLocation, setDeliveryLocation] = useState({ lat: '', lng: '' });
    const [showDeliveryMap, setShowDeliveryMap] = useState(false);
    const [deliveryMessage, setDeliveryMessage] = useState('');
    const [findingDelivery, setFindingDelivery] = useState(false);
    
    // Priority buttons
    const [priority, setPriority] = useState('balanced'); // 'cost' | 'speed' | 'balanced'
    
    // State
    const [isLoading, setIsLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    
    // Summary popup
    const [showSummary, setShowSummary] = useState(false);
    const [replyAiProvider, setReplyAiProvider] = useState('gemma');
    const [parsedRequirement, setParsedRequirement] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [totalMatches, setTotalMatches] = useState(0);

    // Modal status WhatsApp (QR scan / progres dispatch RFQ)
    const [waModalOpen, setWaModalOpen] = useState(false);
    const [waModalKey, setWaModalKey] = useState(0);
    const [pendingAllocations, setPendingAllocations] = useState([]);
    const [dispatchResult, setDispatchResult] = useState(null);

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

    const findDeliveryLocation = async () => {
        if (deliveryAddress.trim().length < 10) return;
        const address = deliveryAddress;
        setFindingDelivery(true);
        setDeliveryMessage('Mencari titik tujuan…');
        try {
            const { data } = await client.post('/suppliers/geocode', { address });
            if (deliveryAddressRef.current === address) {
                setDeliveryLocation({ lat: data.lat, lng: data.lng });
                setShowDeliveryMap(true);
                setDeliveryMessage('Titik tujuan ditemukan. Periksa pin pada peta.');
            }
        } catch {
            if (deliveryAddressRef.current === address) {
                setDeliveryMessage('Alamat tidak ditemukan. Pilih titik tujuan lewat pin peta.');
                setShowDeliveryMap(true);
            }
        } finally {
            setFindingDelivery(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        let payload;
        
        if (showManualForm) {
            // Manual form validation
            if (!materialName || !quantity || !unit.trim() || budgetNum <= 0 || !targetDate) {
                toast.error("Mohon lengkapi semua field dengan benar.");
                return;
            }
            payload = {
                materialName,
                quantity: parseFloat(quantity),
                unit: unit.trim(),
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

        if (deliveryLocation.lat !== '' && deliveryLocation.lng !== '') {
            payload.delivery_lat = Number(deliveryLocation.lat);
            payload.delivery_lng = Number(deliveryLocation.lng);
            payload.delivery_address = deliveryAddress.trim();
        }

        setIsLoading(true);
        const toastId = toast.loading("AI sedang menganalisis kebutuhan Anda...");

        try {
            const sourceRes = await client.post('/source', payload);
            const { requirement: parsed, candidates: cands, total_matches: total } = sourceRes.data;
            
            if (!cands || cands.length === 0) {
                toast.error("Tidak ada supplier yang memenuhi kriteria.", { id: toastId });
                setIsLoading(false);
                return;
            }

            toast.dismiss(toastId);
            setParsedRequirement({ ...parsed, priority: payload.priority || parsed.priority,
                ...(payload.delivery_lat !== undefined ? {
                    delivery_lat: payload.delivery_lat, delivery_lng: payload.delivery_lng,
                    delivery_address: payload.delivery_address
                } : {}) });
            setCandidates(cands);
            setTotalMatches(total ?? cands.length);
            setShowSummary(true);
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.error || "Gagal memproses.", { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = () => {
        const confirmedUnit = String(parsedRequirement.unit || '').trim();
        if (!confirmedUnit) {
            toast.error('Satuan harus diisi sebelum RFQ dikirim.');
            return;
        }
        setParsedRequirement(prev => ({ ...prev, unit: confirmedUnit }));
        setShowSummary(false);

        // Backend mengembalikan maksimal lima kandidat untuk satu RFQ.
        const allCandidatesAllocations = candidates.map(c => {
            const qty = parsedRequirement.quantity; // Tanyakan full kuantitas ke semua supplier
            const price = c.price_per_unit || (parsedRequirement.maxBudget / parsedRequirement.quantity);
            return {
                ...c,
                supplier_id: c.id,
                qty,
                price,
                cost: price * qty // dipakai template pesan WA untuk hitung harga per unit (cost/qty)
            };
        });

        // Pengiriman sesungguhnya (termasuk tunggu scan QR kalau belum connect di mode Live)
        // ditangani oleh WhatsAppStatusModal, bukan di sini.
        setPendingAllocations(allCandidatesAllocations);
        setDispatchResult(null);
        setWaModalKey(k => k + 1); // pastikan state modal fresh tiap dibuka
        setWaModalOpen(true);
    };

    const handleDispatchComplete = (data) => {
        setDispatchResult(data);
    };

    const handleWaModalClose = () => {
        setWaModalOpen(false);

        const results = dispatchResult?.results || [];
        const successCount = results.filter(r => r.status === 'sent').length;

        if (successCount === 0) {
            toast.error("Tidak ada RFQ yang berhasil terkirim. Coba lagi.");
            return; // tetap di form input supaya bisa dicoba ulang
        }
        if (successCount < results.length) {
            toast.error(`${successCount} dari ${results.length} RFQ terkirim, sisanya gagal.`);
        } else {
            toast.success(`RFQ berhasil dikirim ke ${successCount} supplier!`);
        }

        onConfirm({
            requirement: parsedRequirement,
            candidates,
            optimization: {
                recommended_allocations: pendingAllocations,
                candidates: pendingAllocations
            },
            dispatch_id: dispatchResult.dispatch_id
        });

    };

    return (
        <div className="mx-auto w-full max-w-2xl">
            <datalist id="rfq-unit-suggestions">
                {['kg', 'ton', 'sak', 'lembar', 'batang', 'meter', 'pcs', 'dus', 'karung'].map(item =>
                    <option key={item} value={item} />)}
            </datalist>
            {/* Header */}
            <div className="mb-7 border-b border-slate-100 pb-6">
                <p className="section-eyebrow mb-2">Langkah 01 / kebutuhan material</p>
                <h2 className="text-[23px] font-bold tracking-[-.035em] text-slate-900">Ceritakan kebutuhan Anda</h2>
                <p className="mt-2 text-sm text-slate-500">Tulis permintaan dalam bahasa sehari-hari atau isi rincian secara manual.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Natural Language Input */}
                {!showManualForm && (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#fbfcfc] focus-within:border-teal-500 focus-within:ring-3 focus-within:ring-teal-500/10">
                        <textarea
                            value={rawInput}
                            onChange={(e) => setRawInput(e.target.value)}
                            placeholder="Butuh baja ringan 10.000 kg, budget 300 juta, dikirim minggu depan"
                            rows={4}
                            className="w-full resize-none border-0 bg-transparent p-5 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        />
                    </div>
                )}

                {/* Manual Form Toggle */}
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setShowManualForm(!showManualForm)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-500 hover:text-teal-600 transition-colors"
                    >
                        {showManualForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {showManualForm ? 'Sembunyikan Form Manual' : 'Isi Manual'}
                    </button>
                </div>

                {/* Manual Form */}
                {showManualForm && (
                    <div className="space-y-5 rounded-xl border border-slate-200 bg-[#fbfcfc] p-5">
                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Nama Material</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Package className="h-5 w-5 text-teal-500" />
                                </div>
                                <input
                                    type="text" list="category-suggestions"
                                    value={materialName} onChange={e => setMaterialName(e.target.value)}
                                    className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
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
                                    className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                                    placeholder="1000" required={showManualForm}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1.5">Satuan</label>
                                <input type="text" list="rfq-unit-suggestions" value={unit} onChange={e => setUnit(e.target.value)}
                                    maxLength={40} placeholder="kg, sak, lembar..." required={showManualForm}
                                    className="w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 bg-slate-50/50 text-slate-900 font-medium transition-all" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Batas Anggaran</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Wallet className="h-5 w-5 text-teal-500" /></div>
                                <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none"><span className="text-slate-500 font-bold">Rp</span></div>
                                <input type="text" value={budgetStr} onChange={handleBudgetChange}
                                    className="pl-[4.5rem] w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 font-bold bg-slate-50/50 transition-all"
                                    placeholder="30.000.000" required={showManualForm}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-600 mb-1.5">Target Pengiriman</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Calendar className="h-5 w-5 text-teal-500" /></div>
                                <input type="date" min={getTodayStr()} value={targetDate} onChange={e => setTargetDate(e.target.value)}
                                    className="pl-11 w-full border-slate-200 rounded-xl shadow-sm border py-3 px-4 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 text-slate-900 bg-slate-50/50 font-medium transition-all"
                                    required={showManualForm}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                    <label htmlFor="delivery-address" className="block text-sm font-bold text-slate-800">Lokasi pengiriman (opsional)</label>
                    <p className="text-xs text-slate-500">Tambahkan titik tujuan untuk melihat jarak ke supplier. Lokasi ini tidak memengaruhi peringkat alokasi.</p>
                    <input id="delivery-address" value={deliveryAddress}
                        onChange={event => { deliveryAddressRef.current = event.target.value; setDeliveryAddress(event.target.value); setDeliveryLocation({ lat: '', lng: '' }); setDeliveryMessage(''); }}
                        placeholder="Alamat pengiriman lengkap" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={findDeliveryLocation} disabled={findingDelivery || deliveryAddress.trim().length < 10}
                            className="rounded-lg border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-700 disabled:opacity-50">{findingDelivery ? 'Mencari…' : 'Cari alamat'}</button>
                        <button type="button" onClick={() => setShowDeliveryMap(value => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{showDeliveryMap ? 'Tutup peta' : 'Pilih pin manual'}</button>
                    </div>
                    {deliveryMessage && <p role="status" className="text-xs text-slate-600">{deliveryMessage}</p>}
                    {showDeliveryMap && <SupplierLocationPicker lat={deliveryLocation.lat} lng={deliveryLocation.lng}
                        locationLabel="pengiriman" onChange={point => { setDeliveryLocation(point); setDeliveryMessage('Titik tujuan dipilih.'); }} />}
                </div>

                {/* Priority Buttons */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-[.1em] text-slate-600">Prioritas pengadaan</h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <button type="button" onClick={() => setPriority('cost')}
                            className={`rounded-lg border px-3 py-3 text-xs font-bold transition-colors ${priority === 'cost' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                        >
                            Prioritaskan Biaya
                        </button>
                        <button type="button" onClick={() => setPriority('speed')}
                            className={`rounded-lg border px-3 py-3 text-xs font-bold transition-colors ${priority === 'speed' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                        >
                            Prioritaskan Kecepatan
                        </button>
                        <button type="button" onClick={() => setPriority('balanced')}
                            className={`rounded-lg border px-3 py-3 text-xs font-bold transition-colors ${priority === 'balanced' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                        >
                            Seimbang
                        </button>
                    </div>
                </div>

                {/* Submit */}
                <button type="submit" disabled={isLoading}
                    className="app-primary-button w-full py-3.5 text-sm disabled:opacity-50"
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
                    <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-teal-500" />
                                Ringkasan AI
                            </h3>
                            <button type="button" onClick={() => setShowSummary(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <p className="text-sm text-slate-500 font-medium">AI telah menganalisis permintaan Anda. Anda bisa merevisi langsung di bawah ini:</p>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Material</label>
                                    <input type="text" value={parsedRequirement.materialName}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, materialName: e.target.value}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-slate-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Kuantitas</label>
                                        <input type="number" value={parsedRequirement.quantity}
                                            onChange={(e) => setParsedRequirement(prev => ({...prev, quantity: parseFloat(e.target.value) || 0}))}
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Satuan</label>
                                        <input type="text" list="rfq-unit-suggestions" value={parsedRequirement.unit || ''}
                                            onChange={(e) => setParsedRequirement(prev => ({...prev, unit: e.target.value}))}
                                            maxLength={40} placeholder="Contoh: sak" required
                                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-slate-900" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Budget Maks (Rp)</label>
                                    <input type="number" value={parsedRequirement.maxBudget}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, maxBudget: parseInt(e.target.value) || 0}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Target Pengiriman</label>
                                    <input type="date" value={parsedRequirement.targetDeliveryDate?.split('T')[0]}
                                        onChange={(e) => setParsedRequirement(prev => ({...prev, targetDeliveryDate: new Date(e.target.value).toISOString()}))}
                                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-slate-900"
                                    />
                                </div>
                            </div>
                            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
                                <span>
                                    <span className="block text-sm font-bold text-slate-800">Gunakan Gemini untuk balasan supplier</span>
                                    <span className="block text-xs text-slate-500 mt-1">{replyAiProvider === 'gemini' ? 'Gemini menganalisis dan mem-parsing balasan supplier.' : 'Gemma menganalisis dan mem-parsing balasan supplier.'} Parsing RFQ buyer tetap memakai Gemini.</span>
                                </span>
                                <input type="checkbox" role="switch" aria-label="Gunakan Gemini untuk balasan supplier"
                                    checked={replyAiProvider === 'gemini'} onChange={event => setReplyAiProvider(event.target.checked ? 'gemini' : 'gemma')}
                                    className="sr-only peer" />
                                <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-500 peer-focus-visible:ring-4 peer-focus-visible:ring-teal-200 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
                            </label>
                            
                            <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
                                <p className="text-sm font-bold text-teal-800 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    RFQ ke {candidates.length} supplier{totalMatches > candidates.length ? ` dari ${totalMatches} yang ditemukan` : ''} (maksimal 5)
                                </p>
                                <p className="text-xs text-teal-600 mt-1">Jika dikonfirmasi, AI akan langsung mengirim RFQ ke semua supplier tersebut via WhatsApp.</p>
                            </div>
                            {candidates.some(candidate => candidate.distance_km != null) && <div className="rounded-xl border border-slate-200 p-3">
                                <p className="text-xs font-bold text-slate-700">Estimasi jarak dari titik pengiriman</p>
                                <ul className="mt-2 space-y-1 text-xs text-slate-600">{candidates.filter(candidate => candidate.distance_km != null).map(candidate =>
                                    <li key={candidate.id} className="flex justify-between gap-3"><span>{candidate.name}</span><span className="tabular-nums">{Number(candidate.distance_km).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km</span></li>)}</ul>
                            </div>}
                        </div>
                        
                        <div className="p-5 border-t border-slate-100 bg-white flex shrink-0 justify-end gap-3">
                            <button type="button" onClick={() => setShowSummary(false)}
                                className="flex items-center gap-2 px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                <X className="h-4 w-4" /> Batal
                            </button>
                            <button type="button" onClick={handleConfirm}
                                className="app-primary-button"
                            >
                                <Check className="h-4 w-4" /> Konfirmasi & Kirim
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <WhatsAppStatusModal
                key={waModalKey}
                isOpen={waModalOpen}
                onClose={handleWaModalClose}
                requirement={parsedRequirement}
                replyAiProvider={replyAiProvider}
                allocations={pendingAllocations}
                companyName="PT Pasokin Demo"
                onDispatchComplete={handleDispatchComplete}
            />
        </div>
    );
}
