import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ClipboardList, RefreshCw } from 'lucide-react';
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

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="section-eyebrow">Daftar pengadaan</p><h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Semua permintaan berjalan</h2></div>
      <button type="button" onClick={refresh} className="app-secondary-button"><RefreshCw size={14} /> Perbarui</button>
    </div>

    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" onClick={refresh} className="inline-flex items-center gap-1 font-semibold"><RefreshCw size={14} /> Coba lagi</button></div>}
    {!loading && items.length > 0 && <div className="border-b border-slate-200 pb-4">
      <label className="block sm:hidden"><span className="app-label">FILTER STATUS</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="app-input">{activeStatusFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="hidden flex-wrap gap-2 sm:flex" role="group" aria-label="Filter status pengadaan">{activeStatusFilters.map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)}
        aria-pressed={statusFilter === value}
        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${statusFilter === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-500'}`}>{label}</button>)}</div>
    </div>}

    {loading ? <p className="text-sm text-slate-500">Memuat pengadaan…</p> : items.length === 0 ?
      <div className="app-empty"><span className="app-empty-icon"><ClipboardList size={21} /></span>
        <p className="text-lg font-semibold text-slate-800">Belum ada pengadaan aktif</p>
        <p className="mt-1 text-sm text-slate-500">Mulai permintaan baru melalui menu Pengadaan Baru.</p>
      </div> : visibleItems.length === 0 ?
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="font-semibold text-slate-800">Tidak ada pengadaan dengan status ini.</p>
        <button type="button" onClick={() => setStatusFilter('all')} className="mt-3 text-sm font-semibold text-teal-700">Lihat semua pengadaan</button>
      </div> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Daftar pengadaan aktif">
        {visibleItems.map(item => <button key={item.id} type="button" onClick={() => onOpenDetail(item.id)}
          className="group app-panel w-full p-5 text-left transition-all hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-[0_12px_26px_rgba(24,52,61,.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
          <div className="flex items-start justify-between gap-3"><span className="font-mono text-[11px] font-semibold tracking-wide text-slate-400">{item.reference_code}</span><ArrowRight size={17} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-700" /></div>
          <strong className="mt-3 block min-h-12 text-[17px] font-bold leading-snug tracking-[-.02em] tabular-nums text-slate-900">{item.material_summary || 'Material belum diisi'}</strong>
          <div className="mt-3"><ProcurementStatus value={item.status} /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4"><div><span className="block text-[11px] text-slate-400">Supplier dituju</span><strong className="mt-1 block text-sm tabular-nums text-slate-800">{item.supplier_count}</strong></div><div><span className="block text-[11px] text-slate-400">Diperbarui</span><strong className="mt-1 block text-xs font-semibold text-slate-700">{formatProcurementDate(item.updated_at || item.created_at)}</strong></div></div>
          <span className="mt-3 block text-[11px] text-slate-400">Dibuat {formatProcurementDate(item.created_at)}</span>
        </button>)}
      </div>}
  </div>;
}
