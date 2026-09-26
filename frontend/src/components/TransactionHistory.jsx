import { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import client from '../api/client';
import PaymentPanel from './PaymentPanel';

const formatDate = value => value
  ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const formatMoney = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

export default function TransactionHistory({ onOpenDashboard, refreshKey, demoMode, initialProcurementId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!selectedId && initialProcurementId && history.some(row => row.id === initialProcurementId)) {
      setSelectedId(initialProcurementId);
    }
  }, [initialProcurementId, history, selectedId]);

  useEffect(() => {
    let live = true;
    client.get('/procurements/history').then(({ data }) => {
      if (!live) return;
      setHistory(data.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)));
      setError('');
    }).catch(() => { if (live) setError('Riwayat belum bisa dimuat.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    client.get(`/procurements/${encodeURIComponent(selectedId)}`)
      .then(({ data }) => { if (live) setDetail(data); })
      .catch(() => { if (live) setError('Detail riwayat belum bisa dimuat.'); });
    return () => { live = false; };
  }, [selectedId, refreshKey]);

  const filtered = history.filter(row => {
    if (reviewOnly && !row.payment_statuses?.includes('disputed')) return false;
    const query = search.toLocaleLowerCase('id-ID');
    return [row.reference_code, row.material_summary, row.id,
      ...(row.suppliers || []).map(supplier => supplier.name)].some(value =>
      String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });
  const selected = history.find(row => row.id === selectedId);
  const disputeCount = history.filter(row => row.payment_statuses?.includes('disputed')).length;

  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><History className="h-5 w-5 text-teal-700" /> Riwayat Transaksi</h2>
        <p className="mt-1 text-sm text-slate-500">Pengadaan yang sudah selesai tersimpan di sini.</p></div>
      <div className="flex flex-wrap items-center gap-2">{disputeCount > 0 && <button type="button" onClick={() => setReviewOnly(value => !value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${reviewOnly ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-800'}`}>Perlu review sengketa: {disputeCount}</button>}<label className="relative"><span className="sr-only">Cari riwayat</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari kode, material, supplier" className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-teal-700" /></label></div>
    </div>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Memuat riwayat…</p> : filtered.length === 0 ?
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">{search || reviewOnly ? 'Tidak ada transaksi yang cocok.' : 'Belum ada pengadaan yang selesai.'}</div> :
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="space-y-3" aria-label="Daftar pengadaan selesai">
          {filtered.map(row => {
            const total = row.manual_price != null && row.manual_quantity != null
              ? Number(row.manual_price) * Number(row.manual_quantity)
              : (row.suppliers || []).reduce((sum, supplier) => sum + Number(supplier.allocation_snapshot?.allocated_qty ?? supplier.allocation_snapshot?.qty ?? 0) * Number(supplier.allocation_snapshot?.price || 0), 0);
            return <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`w-full rounded-xl border bg-white p-5 text-left ${selectedId === row.id ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200 hover:border-slate-400'}`}>
              <span className="text-xs font-semibold text-teal-700">{row.reference_code}</span>
              <strong className="mt-1 block text-base tabular-nums text-slate-900">{row.material_summary || row.parsed_material_summary?.materialName || 'Material'}</strong>
              <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Selesai</span>
              <span className="mt-2 ml-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Pembayaran: {row.payment_statuses?.length ? row.payment_statuses.map(status => ({ awaiting_payment: 'menunggu', paid_held: 'ditahan', shipped: 'dikirim', delivered: 'diterima', released: 'dilepas', disputed: 'sengketa', expired: 'kedaluwarsa', refunded: 'dikembalikan' })[status] || status).join(', ') : 'belum ada'}</span>
              <span className="mt-3 flex justify-between gap-2 text-xs text-slate-500"><span className="tabular-nums">{row.supplier_count} supplier</span><span>{formatDate(row.updated_at)}</span></span>
              <span className="mt-2 block text-sm font-semibold tabular-nums text-slate-700">{formatMoney(total)}</span>
            </button>;
          })}
        </div>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 md:p-7" aria-label="Detail riwayat">
          {!selectedId ? <p className="text-sm text-slate-500">Pilih pengadaan untuk melihat detailnya.</p> : !detail || detail.id !== selectedId ? <p className="text-sm text-slate-500">Memuat detail…</p> : <>
            <p className="text-xs font-semibold text-teal-700">{detail.reference_code}</p>
            <h3 className="mt-1 text-xl font-bold tabular-nums">{detail.material_summary}</h3>
            <p className="mt-1 text-xs text-slate-500">Selesai · diperbarui {formatDate(detail.updated_at)}</p>
            {detail.manual_price != null && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm tabular-nums">Harga final: {formatMoney(detail.manual_price)} per {detail.manual_unit} × {Number(detail.manual_quantity).toLocaleString('id-ID')} {detail.manual_unit}</p>}
            <div className="mt-5"><PaymentPanel procurementId={selectedId} demoMode={demoMode} /></div>
            <h4 className="mt-6 font-semibold">Alokasi supplier</h4>
            {detail.allocations?.length ? <ul className="mt-2 space-y-2">{detail.allocations.map(allocation => <li key={allocation.id} className="flex justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm"><span>{detail.dispatched_suppliers?.find(supplier => supplier.supplier_id === allocation.supplier_id)?.name || allocation.supplier_id}</span><span className="tabular-nums">{Number(allocation.quantity).toLocaleString('id-ID')} · {formatMoney(allocation.total_cost)}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Tidak ada alokasi tersimpan.</p>}
            <h4 className="mt-6 font-semibold">Pesan pengadaan ini</h4>
            {detail.messages?.length ? <div className="mt-2 space-y-2">{detail.messages.map(message => <div key={message.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="mb-1 text-xs font-semibold text-slate-500">{message.supplier_name} · {message.direction === 'inbound' ? 'Balasan' : 'Terkirim'} · {formatDate(message.created_at)}</p><p className="whitespace-pre-wrap break-words">{message.raw_text}</p></div>)}</div> : <p className="mt-2 text-sm text-slate-500">Belum ada pesan tersimpan.</p>}
            {selected?.suppliers?.length > 0 && <button onClick={() => onOpenDashboard(selected)} className="mt-6 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Buka tampilan alokasi lama</button>}
          </>}
        </section>
      </div>}
  </div>;
}
