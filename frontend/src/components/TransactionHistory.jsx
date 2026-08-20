import { useState, useEffect } from 'react';
import { History, Package, Calendar, Search, ArrowRight, ExternalLink } from 'lucide-react';
import client from '../api/client';

export default function TransactionHistory({ onOpenDashboard }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        client.get('/dispatch-wa/history')
            .then(res => {
                // Kelompokkan log berdasarkan dispatch_id agar 1 transaksi = 1 baris
                const grouped = res.data.reduce((acc, log) => {
                    if (!acc[log.dispatch_id]) {
                        acc[log.dispatch_id] = {
                            dispatch_id: log.dispatch_id,
                            dispatched_at: log.dispatched_at,
                            requirement: log.requirement_snapshot,
                            suppliers: [],
                        };
                    }
                    acc[log.dispatch_id].suppliers.push(log);
                    return acc;
                }, {});
                
                // Urutkan dari terbaru
                const sorted = Object.values(grouped).sort((a, b) => new Date(b.dispatched_at) - new Date(a.dispatched_at));
                setHistory(sorted);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
    const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const filteredHistory = history.filter(h => 
        h.dispatch_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.requirement.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.suppliers.some(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <History className="h-6 w-6 text-amber-500" /> Riwayat Transaksi
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium">Lacak semua RFQ dan Pesanan Pembelian yang telah dikirim.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Cari ID, material, atau supplier..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm w-full sm:w-64 transition-all"
                    />
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 flex justify-center shadow-sm">
                    <div className="animate-pulse flex flex-col items-center gap-3">
                        <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                        <div className="h-4 w-32 bg-slate-200 rounded"></div>
                    </div>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center shadow-sm text-center">
                    <div className="bg-slate-50 p-4 rounded-full mb-4">
                        <History className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="text-slate-700 font-bold mb-1">Belum ada transaksi</h3>
                    <p className="text-slate-500 text-sm">Riwayat pengadaan dan RFQ Anda akan muncul di sini.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">ID Transaksi / Waktu</th>
                                    <th className="px-6 py-4">Kebutuhan Utama</th>
                                    <th className="px-6 py-4">Supplier Dikontak</th>
                                    <th className="px-6 py-4">Total Nilai (Estimasi)</th>
                                    <th className="px-6 py-4 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredHistory.map((h) => {
                                    const totalCost = h.suppliers.reduce((sum, s) => sum + (s.allocation_snapshot?.qty * s.allocation_snapshot?.price || 0), 0);
                                    
                                    return (
                                        <tr key={h.dispatch_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-mono text-xs font-bold text-slate-900 mb-1">#{h.dispatch_id.substring(0,8)}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(h.dispatched_at)}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900 flex items-center gap-1.5"><Package className="h-4 w-4 text-slate-400" /> {h.requirement.materialName}</div>
                                                <div className="text-xs text-slate-500 mt-1">{h.requirement.quantity} {h.requirement.unit} • Maks {formatIDR(h.requirement.maxBudget)}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex -space-x-2">
                                                    {h.suppliers.slice(0,3).map((s, i) => (
                                                        <div key={i} className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-sm" title={s.name}>
                                                            {s.name?.substring(0,2).toUpperCase()}
                                                        </div>
                                                    ))}
                                                    {h.suppliers.length > 3 && (
                                                        <div className="h-8 w-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500 shadow-sm">
                                                            +{h.suppliers.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-700">
                                                {formatIDR(totalCost)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => onOpenDashboard(h)}
                                                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                                                >
                                                    Detail <ArrowRight className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
