import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import client from '../api/client';
import ProcurementStatus from './ProcurementStatus';
import { activeStatusFilters, formatProcurementDate } from './procurementStatusData';

export default function ActiveProcurements({ refreshKey, onOpenDetail }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const visibleItems = statusFilter === 'all' ? items : items.filter(item => item.status === statusFilter);

  const refresh = useCallback(async () => {
    try {
      const { data } = await client.get('/procurements');
      const active = data.filter(row => row.status !== 'completed');
      setItems(active.sort((a, b) => {
        const attention = status => status === 'needs_manual_review' ? 1 : 0;
        return attention(b.status) - attention(a.status) ||
          new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      }));
      setError('');
    } catch {
      setError('Daftar pengadaan belum bisa dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    const fallback = setInterval(refresh, 15000);
    return () => clearInterval(fallback);
  }, [refresh]);

  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Pengadaan Aktif</h2>
      <p className="mt-1 text-sm text-slate-500">Pantau setiap permintaan dan balasan supplier dalam satu tempat.</p>
    </div>

    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" onClick={refresh} className="inline-flex items-center gap-1 font-semibold"><RefreshCw size={14} /> Coba lagi</button></div>}
    {!loading && items.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status pengadaan">
      {activeStatusFilters.map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)}
        aria-pressed={statusFilter === value}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${statusFilter === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-500'}`}>
        {label}
      </button>)}
    </div>}

    {loading ? <p className="text-sm text-slate-500">Memuat pengadaan…</p> : items.length === 0 ?
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p className="text-lg font-semibold text-slate-800">Belum ada pengadaan aktif</p>
        <p className="mt-1 text-sm text-slate-500">Mulai permintaan baru melalui menu Pengadaan Baru.</p>
      </div> : visibleItems.length === 0 ?
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="font-semibold text-slate-800">Tidak ada pengadaan dengan status ini.</p>
        <button type="button" onClick={() => setStatusFilter('all')} className="mt-3 text-sm font-semibold text-teal-700">Lihat semua pengadaan</button>
      </div> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Daftar pengadaan aktif">
        {visibleItems.map(item => <button key={item.id} type="button" onClick={() => onOpenDetail(item.id)}
          className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
          <div className="flex items-start justify-between gap-3"><strong className="text-base tabular-nums text-slate-900">{item.material_summary || 'Material belum diisi'}</strong><ArrowRight size={17} className="shrink-0 text-slate-400" /></div>
          <div className="mt-3"><ProcurementStatus value={item.status} /></div>
          <div className="mt-4 flex justify-between gap-3 text-xs text-slate-500"><span className="tabular-nums">{item.supplier_count} supplier</span><span className="text-right">Dibuat {formatProcurementDate(item.created_at)}</span></div>
          <p className="mt-1 text-right text-xs text-slate-400">Diperbarui {formatProcurementDate(item.updated_at)}</p>
          <p className="mt-2 font-mono text-xs text-slate-400">{item.reference_code}</p>
        </button>)}
      </div>}
  </div>;
}
