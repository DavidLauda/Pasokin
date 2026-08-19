import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Cpu } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';

export default function SupplierRepliesPanel({ allocations, demoMode, onShortfall }) {
    const [replies, setReplies] = useState([]);
    const [filter, setFilter] = useState('all'); // 'all' | 'confirmed' | 'needs_manual_review'
    const [expandedRows, setExpandedRows] = useState({});

    const fetchReplies = async () => {
        try {
            const res = await client.get('/wa-replies');
            setReplies(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchReplies();
        const interval = setInterval(fetchReplies, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleRow = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSimulate = async (style) => {
        if (!allocations || allocations.length === 0) {
            toast.error("Belum ada supplier di list dispatch untuk simulasi.");
            return;
        }
        const supplier = allocations[0];
        const toastId = toast.loading(`Mensimulasikan balasan (${style})...`);
        try {
            await client.post('/wa-replies/simulate', {
                phone: supplier.phone,
                style
            });
            toast.success("Simulasi berhasil dibuat", { id: toastId });
            fetchReplies();
        } catch (err) {
            toast.error("Gagal simulasi", { id: toastId });
        }
    };

    const handleResolve = async (id) => {
        try {
            const res = await client.post(`/wa-replies/${id}/resolve`);
            toast.success("Ditandai sudah ditangani");
            
            if (res.data.shortfall_recommendations && onShortfall) {
                toast("Mendeteksi kekurangan pasokan. Mencarikan alternatif...", { icon: '🤖' });
                onShortfall(res.data.shortfall_recommendations);
            }
            
            fetchReplies();
        } catch (e) {
            toast.error("Gagal update status");
        }
    };

    const handleOverride = async (id, newClass) => {
        try {
            await client.post(`/wa-replies/${id}/override`, { classification: newClass, note: "Diubah manual oleh admin" });
            toast.success("Klasifikasi diubah manual");
            fetchReplies();
        } catch (e) {
            toast.error("Gagal override");
        }
    };

    const filteredReplies = replies.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'confirmed') return r.classification === 'confirmed';
        if (filter === 'needs_manual_review') return r.classification === 'needs_manual_review' || r.classification === 'unmatched';
        return true;
    });

    const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

    const renderBadge = (classification) => {
        if (classification === 'pending') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 animate-spin" /> Menganalisis...</span>;
        if (classification === 'confirmed') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3" /> Sesuai Template</span>;
        if (classification === 'needs_manual_review') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> Perlu Nego Manual</span>;
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800"><HelpCircle className="h-3 w-3" /> Tidak Dikenali</span>;
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            
            {demoMode && (
                <div className="bg-white/80 backdrop-blur-md border border-amber-200/50 rounded-[2rem] p-6 shadow-xl shadow-amber-900/5 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-amber-600 font-extrabold tracking-wide">
                        <Cpu className="h-6 w-6" />
                        <span>[DEV] Simulator Balasan WA</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => handleSimulate('confirmed')} className="px-5 py-2.5 text-sm font-extrabold bg-green-500 text-white rounded-full hover:bg-green-600 hover:scale-105 shadow-md shadow-green-500/20 transition-all">Simulasi: Sesuai</button>
                        <button onClick={() => handleSimulate('negotiate')} className="px-5 py-2.5 text-sm font-extrabold bg-amber-500 text-white rounded-full hover:bg-amber-600 hover:scale-105 shadow-md shadow-amber-500/20 transition-all">Simulasi: Nego</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 bg-slate-50">
                    <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2"><div className="w-2 h-6 bg-amber-500 rounded-full"></div> Daftar Pesan Masuk</h2>
                    <div className="flex bg-slate-200 p-1.5 rounded-full">
                        <button onClick={() => setFilter('all')} className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${filter === 'all' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>Semua</button>
                        <button onClick={() => setFilter('confirmed')} className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${filter === 'confirmed' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-800'}`}>Siap Lanjut</button>
                        <button onClick={() => setFilter('needs_manual_review')} className={`px-5 py-2 text-sm font-bold rounded-full transition-all ${filter === 'needs_manual_review' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>Perlu Negosiasi</button>
                    </div>
                </div>

                <div className="divide-y divide-slate-100">
                    {filteredReplies.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <p className="text-lg font-medium text-slate-700 mb-1">Belum ada balasan yang masuk.</p>
                            <p className="text-sm">Menunggu tanggapan dari supplier di WhatsApp...</p>
                        </div>
                    ) : filteredReplies.map(r => (
                        <div key={r.reply_id} className={`flex flex-col ${r.resolved ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
                            {/* Row Header */}
                            <div 
                                className="px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleRow(r.reply_id)}
                            >
                                <div className="flex-1 min-w-0 pr-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-base font-extrabold text-slate-900 truncate">
                                            {r.supplier_name || r.phone}
                                        </h3>
                                        {renderBadge(r.classification)}
                                        {r.human_override && <span className="text-[10px] uppercase tracking-widest font-extrabold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">Diubah Manual</span>}
                                        {r.resolved && <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">Selesai</span>}
                                    </div>
                                    <div className="text-sm text-slate-500 truncate flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">{new Date(r.received_at).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span>
                                        <span className="truncate italic font-medium">"{r.message_received}"</span>
                                    </div>
                                    <div className="text-sm text-amber-600 font-semibold mt-2 bg-amber-50 inline-block px-3 py-1.5 rounded-lg border border-amber-100">
                                        ↳ {r.ai_summary}
                                    </div>
                                </div>
                                <div>
                                    {expandedRows[r.reply_id] ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedRows[r.reply_id] && (
                                <div className="px-6 pb-6 pt-2 bg-slate-50 border-t border-slate-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Original Message */}
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pesan Asli</h4>
                                            <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap shadow-sm">
                                                {r.message_received}
                                            </div>
                                        </div>

                                        {/* Extracted vs Requested */}
                                        {r.classification === 'confirmed' && r.original_allocation && r.ai_extracted && (
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Perbandingan Data (AI Extraction)</h4>
                                                <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm shadow-sm overflow-hidden">
                                                    <table className="w-full text-left">
                                                        <thead>
                                                            <tr className="text-slate-400 border-b border-slate-100">
                                                                <th className="pb-1 font-medium">Parameter</th>
                                                                <th className="pb-1 font-medium text-right">Permintaan (RFQ)</th>
                                                                <th className="pb-1 font-medium text-right">Disetujui Supplier</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            <tr>
                                                                <td className="py-2 text-slate-600">Kuantitas</td>
                                                                <td className="py-2 text-right text-slate-900 font-medium">{r.original_allocation.qty}</td>
                                                                <td className={`py-2 text-right font-medium ${r.ai_extracted.qty !== r.original_allocation.qty ? 'text-amber-600' : 'text-green-600'}`}>{r.ai_extracted.qty || '-'}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 text-slate-600">Harga/unit</td>
                                                                <td className="py-2 text-right text-slate-900 font-medium">{formatIDR(r.original_allocation.price)}</td>
                                                                <td className={`py-2 text-right font-medium ${r.ai_extracted.price && r.ai_extracted.price !== r.original_allocation.price ? 'text-amber-600' : 'text-green-600'}`}>{r.ai_extracted.price ? formatIDR(r.ai_extracted.price) : '-'}</td>
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 text-slate-600">Lead Time</td>
                                                                <td className="py-2 text-right text-slate-900 font-medium">{r.original_allocation.lead_time_days} Hari</td>
                                                                <td className={`py-2 text-right font-medium ${r.ai_extracted.lead_time_days && r.ai_extracted.lead_time_days !== r.original_allocation.lead_time_days ? 'text-amber-600' : 'text-green-600'}`}>{r.ai_extracted.lead_time_days ? `${r.ai_extracted.lead_time_days} Hari` : '-'}</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-6 flex flex-wrap items-center gap-4 pt-5 border-t border-slate-100">
                                        {!r.resolved && r.classification === 'confirmed' && (
                                            <button onClick={() => handleResolve(r.reply_id)} className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-extrabold rounded-full shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 hover:scale-105 flex items-center gap-2 transition-all">
                                                <CheckCircle className="h-4 w-4" /> Lanjut ke Konfirmasi PO
                                            </button>
                                        )}
                                        
                                        {!r.resolved && (r.classification === 'needs_manual_review' || r.classification === 'unmatched') && (
                                            <>
                                                <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-slate-900 text-white text-sm font-extrabold rounded-full shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:scale-105 flex items-center gap-2 transition-all">
                                                    <ExternalLink className="h-4 w-4" /> Buka di WhatsApp
                                                </a>
                                                <button onClick={() => handleResolve(r.reply_id)} className="px-6 py-2.5 bg-white border-2 border-slate-200 text-slate-700 text-sm font-extrabold rounded-full shadow-sm hover:bg-slate-50 hover:border-slate-300 flex items-center gap-2 transition-all">
                                                    <CheckCircle className="h-4 w-4 text-emerald-500" /> Tandai Sudah Ditangani
                                                </button>
                                            </>
                                        )}

                                        {/* Override Dropdown */}
                                        <div className="ml-auto flex items-center gap-3">
                                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ubah Manual:</span>
                                            <select 
                                                className="text-sm border-slate-200 font-bold text-slate-700 rounded-xl py-2 pl-4 pr-10 shadow-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50"
                                                value={r.classification}
                                                onChange={(e) => handleOverride(r.reply_id, e.target.value)}
                                            >
                                                <option value="pending" disabled>Pending...</option>
                                                <option value="confirmed">Sesuai Template</option>
                                                <option value="needs_manual_review">Perlu Nego Manual</option>
                                                <option value="unmatched" disabled>Tidak Dikenali</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
