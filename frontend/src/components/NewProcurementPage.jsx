import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import client from '../api/client';
import RequirementForm from './RequirementForm';
import ProcurementStatus from './ProcurementStatus';
import { formatProcurementDate } from './procurementStatusData';
import { createdThisMonth, monthlyActivity } from './procurementContext';

const monthTitle = () => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date());

export default function NewProcurementPage({ onConfirm, refreshKey }) {
  const [active, setActive] = useState([]);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeResult, historyResult] = await Promise.all([
        client.get('/procurements'), client.get('/procurements/history')
      ]);
      const current = activeResult.data.filter(row => row.status !== 'completed');
      const history = historyResult.data;
      const monthly = current.filter(row => createdThisMonth(row));
      const detailResults = await Promise.allSettled(monthly.map(row => client.get(`/procurements/${encodeURIComponent(row.id)}`)));
      const details = new Map();
      detailResults.forEach((result, index) => {
        if (result.status === 'fulfilled') details.set(monthly[index].id, result.value.data);
      });
      setActive(current.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)));
      setActivity(monthlyActivity(current, history, details));
    } catch {
      setActive([]);
      setActivity(null);
      setError('Ringkasan pengadaan belum bisa dimuat. Form pengadaan tetap dapat digunakan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  return <div className="grid w-full items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-8 shadow-sm sm:px-8" aria-label="Form pengadaan baru">
      <RequirementForm onConfirm={onConfirm} />
    </section>

    <aside className="space-y-4" aria-label="Konteks pengadaan">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="active-context-title">
        <div className="flex items-start justify-between gap-3"><div>
          <h2 id="active-context-title" className="text-sm font-bold text-slate-900">Pengadaan aktif saat ini</h2>
          <p className="mt-1 text-xs text-slate-500">{loading ? 'Memuat…' : error ? 'Data belum tersedia' : `${active.length} pengadaan berjalan`}</p>
        </div><ArrowRight size={16} className="text-slate-400" /></div>
        {loading ? <p className="mt-4 text-xs text-slate-500">Memuat ringkasan…</p>
          : error ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Ringkasan belum tersedia.</p>
          : active.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Belum ada pengadaan aktif. Permintaan baru dimulai dari form di sebelah.</p>
          : <ul className="mt-4 divide-y divide-slate-100">{active.slice(0, 5).map(row => <li key={row.id} className="py-3 first:pt-0 last:pb-0">
            <p className="truncate text-sm font-semibold text-slate-800">{row.material_summary || 'Material belum diisi'}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2"><ProcurementStatus value={row.status} compact /><span className="text-[11px] text-slate-500">{formatProcurementDate(row.updated_at || row.created_at)}</span></div>
          </li>)}</ul>}
        {active.length > 5 && <p className="mt-3 text-xs text-slate-500">Dan {active.length - 5} pengadaan lainnya di Pengadaan Aktif.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="month-context-title">
        <div className="flex items-center justify-between gap-2"><div><h2 id="month-context-title" className="text-sm font-bold text-slate-900">Bulan ini</h2><p className="mt-1 text-xs capitalize text-slate-500">{monthTitle()}</p></div><button type="button" onClick={refresh} aria-label="Perbarui fakta bulan ini" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><RefreshCw size={15} /></button></div>
        {loading ? <p className="mt-4 text-xs text-slate-500">Menghitung aktivitas…</p> : activity && <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[[activity.created, 'Pengadaan dibuat'], [activity.contacted, 'Supplier dihubungi'], [activity.completed, 'Selesai']].map(([value, label]) =>
            <div key={label} className="rounded-lg bg-slate-50 px-2 py-3"><dd className="text-xl font-bold tabular-nums text-slate-900">{value ?? '—'}</dd><dt className="mt-1 text-[11px] leading-tight text-slate-500">{label}</dt></div>)}
        </dl>}
        {activity && activity.contacted == null && !loading && <p className="mt-3 text-xs text-slate-500">Jumlah supplier belum tersedia karena sebagian detail pengadaan gagal dimuat.</p>}
      </section>
      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}<button type="button" onClick={refresh} className="ml-2 font-bold underline">Coba lagi</button></div>}
    </aside>
  </div>;
}
