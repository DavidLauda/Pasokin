import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Sparkles, Bot, DollarSign, TrendingDown, Clock, RotateCcw } from 'lucide-react';

const COLORS = ['#0ea5e9', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

export default function OptimizationDashboard({ data, onApprove }) {
    const [allocations, setAllocations] = useState([]);
    const [originalAllocations, setOriginalAllocations] = useState([]);
    
    useEffect(() => {
        if (data?.optimization?.recommended_allocations) {
            const initial = data.optimization.recommended_allocations.map(a => ({
                ...a,
                percentage: parseFloat(a.percentage) || 0
            }));
            setAllocations(initial);
            setOriginalAllocations(JSON.parse(JSON.stringify(initial)));
        }
    }, [data]);

    const formatIDR = (num) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
    };

    const handlePercentageChange = (index, newPercentage) => {
        const val = parseFloat(newPercentage) || 0;
        let newAlloc = [...allocations];
        
        const diff = val - newAlloc[index].percentage;
        newAlloc[index].percentage = val;

        const others = newAlloc.filter((_, i) => i !== index);
        const otherTotal = others.reduce((sum, a) => sum + a.percentage, 0);

        if (others.length > 0) {
            others.forEach(a => {
                if (otherTotal === 0) {
                    a.percentage = (100 - val) / others.length;
                } else {
                    const ratio = a.percentage / otherTotal;
                    a.percentage -= (diff * ratio);
                }
            });
        }

        const totalQty = data.requirement.quantity;
        newAlloc = newAlloc.map(a => {
            const q = totalQty * (a.percentage / 100);
            return {
                ...a,
                percentage: parseFloat(a.percentage.toFixed(1)),
                qty: Math.round(q),
                cost: Math.round(q * a.price_per_unit)
            };
        });

        let sum = newAlloc.reduce((acc, curr) => acc + curr.percentage, 0);
        if (sum !== 100 && others.length > 0) {
           const diffSum = 100 - sum;
           const firstOtherIndex = newAlloc.findIndex((_, i) => i !== index);
           if (firstOtherIndex !== -1) {
              newAlloc[firstOtherIndex].percentage = parseFloat((newAlloc[firstOtherIndex].percentage + diffSum).toFixed(1));
           }
        }

        setAllocations(newAlloc);
    };

    const resetAllocations = () => {
        setAllocations(JSON.parse(JSON.stringify(originalAllocations)));
    };

    if (!allocations.length) return null;

    const totalCost = allocations.reduce((sum, a) => sum + a.cost, 0);
    const avgLeadTime = allocations.reduce((sum, a) => sum + (a.lead_time_days * (a.percentage/100)), 0).toFixed(1);
    const isSumValid = Math.abs(allocations.reduce((sum, a) => sum + a.percentage, 0) - 100) < 0.2;

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-5 hover:-translate-y-1 transition-transform">
                    <div className="bg-amber-50 p-4 rounded-2xl"><DollarSign className="text-amber-600 h-8 w-8" /></div>
                    <div>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Total Biaya</p>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{formatIDR(totalCost)}</p>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-5 hover:-translate-y-1 transition-transform">
                    <div className="bg-emerald-50 p-4 rounded-2xl"><TrendingDown className="text-emerald-600 h-8 w-8" /></div>
                    <div>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Penghematan</p>
                        <p className={`text-3xl font-extrabold tracking-tight ${data.optimization.savings_estimate_percent > 0 ? 'text-emerald-500' : 'text-slate-900'}`}>
                            {data.optimization.savings_estimate_percent}%
                        </p>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-5 hover:-translate-y-1 transition-transform">
                    <div className="bg-amber-50 p-4 rounded-2xl"><Clock className="text-amber-600 h-8 w-8" /></div>
                    <div>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Rata-rata Waktu</p>
                        <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{avgLeadTime} Hari</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                    <h3 className="text-base font-extrabold text-slate-800 mb-6 flex items-center gap-2"><div className="w-2 h-6 bg-amber-400 rounded-full"></div> Persentase Alokasi</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={allocations} dataKey="percentage" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} stroke="none" label>
                                    {allocations.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(value) => `${value}%`} contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                    <h3 className="text-base font-extrabold text-slate-800 mb-6 flex items-center gap-2"><div className="w-2 h-6 bg-amber-500 rounded-full"></div> Estimasi Waktu (Hari)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={allocations} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" />
                                <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 10}} />
                                <Tooltip contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                <Bar dataKey="lead_time_days" fill="#0ea5e9" radius={[0, 8, 8, 0]} name="Lead Time" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2"><div className="w-2 h-6 bg-amber-400 rounded-full"></div> Penyesuaian Manual</h3>
                    <button onClick={resetAllocations} className="text-sm font-bold text-slate-400 hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                        <RotateCcw className="h-4 w-4" /> Reset ke AI
                    </button>
                </div>
                <div className="overflow-x-auto p-4">
                    <table className="w-full text-sm text-left">
                        <thead className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">
                            <tr>
                                <th className="px-6 py-3 font-medium">Supplier & Lokasi</th>
                                <th className="px-6 py-3 font-medium">Penyesuaian Porsi (%)</th>
                                <th className="px-6 py-3 font-medium">Kuantitas</th>
                                <th className="px-6 py-3 font-medium">Biaya (IDR)</th>
                                <th className="px-6 py-3 font-medium">Lead Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {allocations.map((a, i) => (
                                <tr key={a.supplier_id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-800">{a.name}</p>
                                        <p className="text-xs text-slate-500">{a.location || 'Lokasi tidak diketahui'}</p>
                                    </td>
                                    <td className="px-6 py-4 w-64">
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="range" min="0" max="100" step="0.1" 
                                                value={a.percentage} 
                                                onChange={(e) => handlePercentageChange(i, e.target.value)}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            />
                                            <span className="w-12 text-right font-medium text-slate-700">{a.percentage}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-700">{a.qty.toLocaleString()}</td>
                                    <td className="px-6 py-4 font-medium text-slate-700">{formatIDR(a.cost)}</td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                            {a.lead_time_days} Hari
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-end pt-6 pb-16">
                <button
                    disabled={!isSumValid}
                    onClick={() => onApprove(allocations)}
                    className="px-10 py-4 bg-amber-400 text-slate-900 text-lg font-extrabold rounded-full shadow-lg shadow-amber-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    Konfirmasi & Kirim Pesanan
                </button>
            </div>
        </div>
    );
}
