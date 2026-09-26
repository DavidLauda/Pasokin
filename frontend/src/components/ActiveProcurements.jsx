import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import client from '../api/client';

const statuses = {
  parsing: ['Memahami kebutuhan', 'bg-slate-100 text-slate-700'],
  optimizing: ['Menghitung alokasi', 'bg-slate-100 text-slate-700'],
  awaiting_approval: ['Menunggu persetujuan', 'bg-slate-100 text-slate-700'],
  dispatched: ['RFQ terkirim', 'bg-slate-100 text-slate-700'],
  triaging: ['Menunggu balasan', 'bg-slate-100 text-slate-700'],
  needs_manual_review: ['Perlu review manual', 'bg-amber-100 text-amber-800'],
  awaiting_summary_confirmation: ['Menunggu konfirmasi supplier', 'bg-amber-100 text-amber-800'],
  completed: ['Selesai', 'bg-emerald-100 text-emerald-800']
};

function Status({ value }) {
  const [label, color] = statuses[value] || [value || 'Belum diketahui', 'bg-slate-100 text-slate-700'];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

function date(value) {
  return value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default function ActiveProcurements({ onNew, initialId, refreshKey, onOpenWorkflow }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(initialId || null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { data } = await client.get('/procurements');
      const active = data.filter(row => row.status !== 'completed');
      setItems(active.sort((a, b) => {
        const attention = s => s === 'needs_manual_review' ? 1 : 0;
        return attention(b.status) - attention(a.status) || new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      }));
      setSelectedId(current => current && !active.some(row => row.id === current) ? null : current);
      setError('');
    } catch {
      setError('Daftar pengadaan belum bisa dimuat. Periksa koneksi lalu coba lagi.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { setSelectedId(initialId || null); }, [initialId]);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    client.get(`/procurements/${selectedId}`)
      .then(({ data }) => { if (live) { setDetail(data); setError(''); } })
      .catch(() => { if (live) setError('Detail pengadaan belum bisa dimuat.'); });
    return () => { live = false; };
  }, [selectedId, refreshKey, revision]);
  useEffect(() => {
    const fallback = setInterval(() => { refresh(); setRevision(value => value + 1); }, 15000);
    return () => clearInterval(fallback);
  }, [refresh]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Pengadaan Aktif</h2>
        <p className="mt-1 text-sm text-slate-500">Pantau setiap permintaan dan balasan supplier dalam satu tempat.</p>
      </div>
      <button type="button" onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
        <Plus size={16} /> Pengadaan Baru
      </button>
    </div>

    {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button onClick={refresh} className="inline-flex items-center gap-1 font-semibold"><RefreshCw size={14} /> Coba lagi</button></div>}
    {loading ? <p className="text-sm text-slate-500">Memuat pengadaan…</p> : items.length === 0 ?
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <p className="text-lg font-semibold text-slate-800">Belum ada pengadaan aktif</p>
        <p className="mt-1 text-sm text-slate-500">Mulai permintaan baru untuk menghubungi supplier.</p>
        <button onClick={onNew} className="mt-5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">+ Pengadaan Baru</button>
      </div> :
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="space-y-3" aria-label="Daftar pengadaan aktif">
          {items.map(item => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
            className={`w-full rounded-xl border bg-white p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 ${selectedId === item.id ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200 hover:border-slate-400'}`}>
            <div className="flex items-start justify-between gap-3"><strong className="text-base tabular-nums text-slate-900">{item.material_summary || 'Material belum diisi'}</strong><ArrowRight size={17} className="shrink-0 text-slate-400" /></div>
            <div className="mt-3"><Status value={item.status} /></div>
            <div className="mt-4 flex justify-between gap-3 text-xs text-slate-500"><span className="tabular-nums">{item.supplier_count} supplier</span><span className="text-right">Dibuat {date(item.created_at)}</span></div>
            <p className="mt-1 text-right text-xs text-slate-400">Diperbarui {date(item.updated_at)}</p>
            <p className="mt-2 font-mono text-xs text-slate-400">{item.reference_code}</p>
          </button>)}
        </div>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 md:p-7" aria-label="Detail pengadaan">
          {!selectedId ? <p className="text-sm text-slate-500">Pilih pengadaan untuk melihat alokasi dan balasannya.</p> : !detail || detail.id !== selectedId ? <p className="text-sm text-slate-500">Memuat detail…</p> : <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div><p className="font-mono text-xs text-teal-700">{detail.reference_code}</p><h3 className="mt-1 text-xl font-bold tabular-nums text-slate-900">{detail.material_summary}</h3><p className="mt-1 text-xs text-slate-500">Dibuat {date(detail.created_at)}</p></div>
              <Status value={detail.status} />
            </div>
            <div className="mt-6"><h4 className="font-semibold text-slate-900">Alokasi supplier</h4>
              {detail.allocations?.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2 pr-3">Supplier</th><th className="py-2 pr-3">Jumlah</th><th className="py-2 pr-3">Biaya</th></tr></thead><tbody>{detail.allocations.map(a => { const supplier = detail.dispatched_suppliers?.find(s => s.supplier_id === a.supplier_id); return <tr key={a.id} className="border-b border-slate-100"><td className="py-3 pr-3">{supplier?.name || a.supplier_id}</td><td className="py-3 pr-3 tabular-nums">{Number(a.quantity).toLocaleString('id-ID')}</td><td className="py-3 pr-3 tabular-nums">Rp {Number(a.total_cost).toLocaleString('id-ID')}</td></tr>; })}</tbody></table></div> : <p className="mt-2 text-sm text-slate-500">Alokasi tersedia setelah balasan supplier dinilai.</p>}
            </div>
            <div className="mt-7"><h4 className="font-semibold text-slate-900">Status pengiriman</h4>
              {detail.dispatched_suppliers?.length ? <ul className="mt-3 space-y-2">{detail.dispatched_suppliers.map(supplier => <li key={supplier.supplier_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{supplier.name}{supplier.allocation_snapshot?.verification_status === 'verified' && <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Verified</span>}</span><span className={supplier.status === 'sent' ? 'text-emerald-700' : 'text-amber-700'}>{supplier.status === 'sent' ? 'Terkirim' : 'Gagal terkirim'}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Belum ada pengiriman ke supplier.</p>}
            </div>
            <div className="mt-7"><h4 className="font-semibold text-slate-900">Percakapan supplier</h4>
              {detail.messages?.length ? <div className="mt-3 space-y-3">{detail.messages.map(message => <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.direction === 'inbound' ? 'border-teal-100 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}><div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{message.direction === 'inbound' ? message.supplier_name : `Pasokin → ${message.supplier_name}`} · {message.message_type === 'summary_confirmation' ? 'Konfirmasi ringkasan' : 'Negosiasi'}{message.classified_as ? ` · ${message.classified_as.replaceAll('_', ' ')}` : ''}</span><span>{date(message.created_at)}</span></div><p className="whitespace-pre-wrap break-words text-slate-800">{message.raw_text}</p></div>)}</div> : <p className="mt-2 text-sm text-slate-500">Belum ada pesan untuk pengadaan ini.</p>}
            </div>
            {['needs_manual_review', 'awaiting_summary_confirmation'].includes(detail.status) && <a href={`/manual-confirmation.html?procurement_id=${encodeURIComponent(detail.id)}`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Buka konfirmasi harga manual <ArrowRight size={15} /></a>}
            <button type="button" onClick={() => onOpenWorkflow(detail)} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900">Buka alur pengadaan <ArrowRight size={15} /></button>
          </>}
        </section>
      </div>}
  </div>;
}
