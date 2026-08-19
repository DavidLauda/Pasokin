import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Sparkles, Bot, RotateCcw, CheckCircle, AlertTriangle, Clock, ExternalLink, Check, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';

const COLORS = ['#f59e0b', '#8b5cf6', '#0ea5e9', '#10b981', '#ef4444'];

export default function OptimizationDashboard({ data, demoMode }) {
    const [allocations, setAllocations] = useState([]);
    const [originalAllocations, setOriginalAllocations] = useState([]);
    const [replies, setReplies] = useState([]);
    const [confirmedSuppliers, setConfirmedSuppliers] = useState([]); // Supplier IDs confirmed (auto or manual)

    useEffect(() => {
        if (data?.optimization?.recommended_allocations) {
            const initial = data.optimization.recommended_allocations.map(a => {
                const qty = a.qty || 0;
                return {
                    ...a,
                    qty: qty,
                    cost: a.cost !== undefined ? a.cost : Math.round(qty * (a.price_per_unit || 0))
                };
            });
            setAllocations(initial);
            setOriginalAllocations(JSON.parse(JSON.stringify(initial)));
            
            if (data.isHistorical) {
                setConfirmedSuppliers(initial.map(a => a.supplier_id || a.phone));
            }
        }
    }, [data]);

    // Poll supplier replies
    const fetchReplies = async () => {
        try {
            const url = data.dispatch_id ? `/wa-replies?dispatch_id=${data.dispatch_id}` : '/wa-replies';
            const res = await client.get(url);
            
            // Sort to ensure newest replies are on top, but wait, the API might not sort it.
            // Let's just keep the state update as before.
            setReplies(res.data);
            
            // Auto-add confirmed suppliers
            res.data.forEach(r => {
                if (r.classification === 'confirmed' && !r.resolved) {
                    setConfirmedSuppliers(prev => {
                        if (!prev.includes(r.supplier_id || r.phone)) {
                            return [...prev, r.supplier_id || r.phone];
                        }
                        return prev;
                    });
                }
            });
        } catch (err) {
            console.error("Gagal fetch replies", err);
        }
    };

    useEffect(() => {
        fetchReplies();
        if (data.isHistorical) return;
        
        const interval = setInterval(fetchReplies, 3000);
        return () => clearInterval(interval);
    }, [data.dispatch_id, data.isHistorical]);

    const handleSimulate = async (style) => {
        if (!allocations || allocations.length === 0) {
            toast.error("Belum ada supplier.");
            return;
        }
        // Find the first supplier that doesn't have a reply yet
        let supplier = allocations.find(a => !getReplyForAllocation(a));
        if (!supplier) supplier = allocations[0]; // fallback
        
        const toastId = toast.loading(`Mensimulasikan balasan (${style})...`);
        try {
            await client.post('/wa-replies/simulate', { phone: supplier.phone, style });
            toast.success("Simulasi berhasil", { id: toastId });
            fetchReplies();
        } catch (err) {
            toast.error("Gagal simulasi", { id: toastId });
        }
    };

    const handleManualConfirm = async (reply) => {
        try {
            await client.post(`/wa-replies/${reply.reply_id}/override`, { classification: 'confirmed', note: "Dikonfirmasi manual oleh admin" });
            setConfirmedSuppliers(prev => [...prev, reply.supplier_id || reply.phone]);
            toast.success("Supplier dikonfirmasi");
            fetchReplies();
        } catch (e) {
            toast.error("Gagal mengkonfirmasi");
        }
    };

    const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

    const handleQtyChange = (supplierId, newQty) => {
        const val = Math.max(0, parseInt(newQty) || 0);
        setAllocations(prev => prev.map(a => {
            if ((a.supplier_id || a.phone) === supplierId) {
                return { ...a, qty: val, cost: val * a.price_per_unit };
            }
            return a;
        }));
    };

    const handleDeleteAllocation = (supplierId) => {
        setAllocations(prev => prev.filter(a => (a.supplier_id || a.phone) !== supplierId));
    };

    const resetAllocations = () => setAllocations(JSON.parse(JSON.stringify(originalAllocations)));

    const handleFinalSubmit = async () => {
        const toastId = toast.loading("Mengirim konfirmasi jual beli ke supplier...");
        try {
            await client.post('/dispatch-wa', {
                allocations: allocations.filter(a => confirmedSuppliers.includes(a.supplier_id || a.phone)),
                requirement: data.requirement,
                companyName: "PT Pasokin Demo"
            });
            toast.success("Konfirmasi jual beli berhasil dikirim!", { id: toastId });
        } catch (err) {
            toast.error("Gagal mengirim konfirmasi", { id: toastId });
        }
    };

    if (!allocations.length) return null;

    const activeAllocations = allocations.filter(a => confirmedSuppliers.includes(a.supplier_id || a.phone));
    const totalAllocatedQty = activeAllocations.reduce((sum, a) => sum + (a.qty || 0), 0);
    const requiredQty = data.requirement.quantity;
    const unallocatedQty = Math.max(0, requiredQty - totalAllocatedQty);
    const isSumValid = totalAllocatedQty === requiredQty;
    
    const hasConfirmedSuppliers = activeAllocations.length > 0;

    const chartData = activeAllocations.map(a => ({ name: a.name, value: a.qty }));
    if (unallocatedQty > 0) {
        chartData.push({ name: 'Belum Dialokasikan', value: unallocatedQty, fill: '#e2e8f0' });
    }

    // Map replies to allocation data for richer display
    const getReplyForAllocation = (alloc) => {
        return replies.find(r => r.phone === alloc.phone || r.supplier_id === alloc.supplier_id);
    };

    const getStatusBadge = (reply) => {
        if (!reply) return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200"><Clock className="h-3 w-3" /> Menunggu</span>;
        if (reply.classification === 'confirmed') return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle className="h-3 w-3" /> Confirmed</span>;
        if (reply.classification === 'needs_manual_review') return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle className="h-3 w-3" /> Perlu Nego</span>;
        return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200"><Clock className="h-3 w-3" /> Menunggu</span>;
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 pb-20">
            
            {/* Section 1: AI Analysis */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 flex gap-5 shadow-xl shadow-slate-200/50">
                <div className="flex-shrink-0 mt-1">
                    <div className="bg-amber-400 p-3 rounded-2xl shadow-sm">
                        <Sparkles className="h-6 w-6 text-slate-900" />
                    </div>
                </div>
                <div>
                    <h3 className="text-xl font-extrabold text-slate-900 mb-2 flex items-center gap-2">
                        Analisis AI Pasokin <Bot className="h-5 w-5 text-amber-500" />
                    </h3>
                    <p className="text-slate-600 leading-relaxed text-base font-medium">
                        {data.optimization.ai_reasoning}
                    </p>
                </div>
            </div>

            {/* Section 2: Allocation Percentage Chart */}
            {hasConfirmedSuppliers && (
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                    <h3 className="text-base font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                        <div className="w-2 h-6 bg-amber-400 rounded-full"></div> Persentase Alokasi
                    </h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} stroke="none"
                                    label={({ name, percent }) => `${name.split(' ').slice(0,2).join(' ')} : ${(percent * 100).toFixed(0)}%`}
                                >
                                    {chartData.map((entry, index) => <Cell key={index} fill={entry.fill || COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(value) => `${value.toLocaleString()} ${data.requirement.unit}`} contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Section 3: Allocation Recommendation Table */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                        <div className="w-2 h-6 bg-amber-400 rounded-full"></div> Rekomendasi Alokasi
                    </h3>
                    <button onClick={resetAllocations} className="text-sm font-bold text-slate-400 hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                        <RotateCcw className="h-4 w-4" /> Reset ke AI
                    </button>
                </div>
                
                {!hasConfirmedSuppliers ? (
                    <div className="p-10 text-center">
                        <Clock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-bold text-sm">Menunggu konfirmasi supplier...</p>
                        <p className="text-slate-400 text-xs mt-1">Tabel ini akan muncul setelah ada supplier yang mengkonfirmasi balasan.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-6 pb-2 border-b border-slate-100">
                            <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                                <span>Status Kuantitas: {totalAllocatedQty.toLocaleString()} / {requiredQty.toLocaleString()} {data.requirement.unit}</span>
                                <span>{((totalAllocatedQty / requiredQty) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                                <div className={`h-full ${totalAllocatedQty === requiredQty ? 'bg-emerald-500' : totalAllocatedQty > requiredQty ? 'bg-rose-500' : 'bg-amber-500'} transition-all`} style={{ width: `${Math.min(100, (totalAllocatedQty / requiredQty) * 100)}%` }}></div>
                            </div>
                            {totalAllocatedQty > requiredQty && <p className="text-rose-500 text-xs font-bold mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Peringatan: Total alokasi melebihi kebutuhan!</p>}
                            {totalAllocatedQty < requiredQty && <p className="text-amber-600 text-xs font-bold mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Total alokasi masih kurang {unallocatedQty.toLocaleString()} {data.requirement.unit} lagi.</p>}
                        </div>
                        <div className="overflow-x-auto p-4">
                            <table className="w-full text-sm text-left">
                                <thead className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Supplier & Lokasi</th>
                                        <th className="px-6 py-3 font-medium">Kuantitas</th>
                                        <th className="px-6 py-3 font-medium">Biaya</th>
                                        <th className="px-6 py-3 font-medium">Lead Time</th>
                                        <th className="px-6 py-3 font-medium text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {activeAllocations.map((a, i) => (
                                        <tr key={a.supplier_id || a.phone} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <p className="font-semibold text-slate-800">{a.name}</p>
                                                <p className="text-xs text-slate-500">{a.location || '-'}</p>
                                            </td>
                                            <td className="px-6 py-4 w-40">
                                                <div className="relative">
                                                    <input type="number" min="0" step="1"
                                                        value={a.qty}
                                                        onChange={(e) => handleQtyChange(a.supplier_id || a.phone, e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-700">{formatIDR(a.cost)}</td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">{a.lead_time_days} Hari</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleDeleteAllocation(a.supplier_id || a.phone)} className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                                                    <RotateCcw className="h-4 w-4 hidden" />
                                                    <span className="text-xs font-bold text-rose-500">Hapus</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end">
                            <button onClick={handleFinalSubmit} disabled={!isSumValid}
                                className="flex items-center gap-2 px-8 py-3 bg-amber-400 text-white text-sm font-extrabold rounded-full shadow-lg shadow-amber-500/20 hover:bg-amber-500 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                <Send className="h-4 w-4" /> Konfirmasi & Kirim PO
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Section 4: Supplier Replies */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                        <div className="w-2 h-6 bg-amber-400 rounded-full"></div> Balasan Supplier
                    </h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">AI membaca & mengklasifikasi tiap balasan WhatsApp secara otomatis.</p>
                </div>

                {/* Demo Simulator */}
                {demoMode && (
                    <div className="px-8 py-4 border-b border-slate-100 bg-amber-50/50 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-600">[DEV] Simulator Balasan</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleSimulate('confirmed')} className="px-4 py-1.5 text-xs font-bold bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-all">Simulasi: Sesuai</button>
                            <button onClick={() => handleSimulate('negotiate')} className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-all">Simulasi: Nego</button>
                        </div>
                    </div>
                )}

                <div className="divide-y divide-slate-100">
                    {allocations.map(alloc => {
                        const reply = getReplyForAllocation(alloc);
                        const isConfirmedByAI = reply?.classification === 'confirmed';
                        const needsAction = reply && !isConfirmedByAI && !confirmedSuppliers.includes(alloc.supplier_id || alloc.phone);
                        
                        return (
                            <div key={alloc.supplier_id} className="p-6 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h4 className="text-base font-extrabold text-slate-900">{alloc.name}</h4>
                                        {reply && (
                                            <p className="text-xs text-slate-400 font-bold mt-0.5">
                                                {new Date(reply.received_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}
                                            </p>
                                        )}
                                    </div>
                                    {getStatusBadge(reply)}
                                </div>

                                {reply ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                            {reply.ai_summary}
                                        </p>
                                        
                                        <div className="flex items-center gap-3 pt-2">
                                            <a href={`https://wa.me/${reply.phone}`} target="_blank" rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                                            >
                                                Buka di WhatsApp <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                            
                                            {needsAction && (
                                                <button onClick={() => handleManualConfirm(reply)}
                                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-amber-400 hover:bg-amber-500 rounded-full shadow-sm transition-all"
                                                >
                                                    <Check className="h-3.5 w-3.5" /> Confirm
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 italic font-medium">Menunggu balasan...</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
