import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import client from '../api/client';
import ProcurementStatus from './ProcurementStatus';
import { formatProcurementDate } from './procurementStatusData';

const formatNumber = value => Number(value).toLocaleString('id-ID');

export default function ProcurementDetail({ procurementId, refreshKey, onBack, onOpenWorkflow, onOpenHistory }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { data } = await client.get(`/procurements/${encodeURIComponent(procurementId)}`);
      setDetail(data);
      setError('');
    } catch {
      setError('Detail pengadaan belum bisa dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [procurementId]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    const fallback = setInterval(refresh, 15000);
    return () => clearInterval(fallback);
  }, [refresh]);

  const isCompleted = detail?.status === 'completed';
  const returnToList = () => isCompleted ? onOpenHistory() : onBack();
  const suppliers = detail?.dispatched_suppliers || [];
  const messages = detail?.messages || [];
  const replies = messages.filter(message => message.direction === 'inbound');

  return <div className="space-y-6">
    <button type="button" onClick={returnToList} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900">
      <ArrowLeft size={16} /> {isCompleted ? 'Kembali ke Riwayat Transaksi' : 'Kembali ke Pengadaan Aktif'}
    </button>

    {loading && !detail ? <p className="text-sm text-slate-500">Memuat detail pengadaan…</p> : !detail ?
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {error}<button type="button" onClick={refresh} className="ml-3 inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={14} /> Coba lagi</button>
      </div> : <>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" onClick={refresh} className="ml-3 font-semibold underline">Coba lagi</button></div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Ringkasan pengadaan">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold text-teal-700">{detail.reference_code}</p>
            <h2 className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{detail.material_summary || 'Material belum diisi'}</h2>
            <p className="mt-2 text-sm text-slate-500">Dibuat {formatProcurementDate(detail.created_at)} · Diperbarui {formatProcurementDate(detail.updated_at)}</p>
          </div>
          <ProcurementStatus value={detail.status} />
        </div>
        <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
          <div><p className="text-slate-500">Supplier dituju</p><p className="mt-1 font-bold tabular-nums text-slate-900">{suppliers.length}</p></div>
          <div><p className="text-slate-500">Balasan diterima</p><p className="mt-1 font-bold tabular-nums text-slate-900">{replies.length}</p></div>
          <div><p className="text-slate-500">Target pengiriman</p><p className="mt-1 font-semibold text-slate-900">{detail.parsed_material_summary?.targetDeliveryDate ? formatProcurementDate(detail.parsed_material_summary.targetDeliveryDate) : 'Belum ditentukan'}</p></div>
        </div>
        {!isCompleted && <button type="button" onClick={() => onOpenWorkflow(detail)} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Buka alur pengadaan <ArrowRight size={15} />
        </button>}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Alokasi supplier">
          <h3 className="font-bold text-slate-900">Alokasi supplier</h3>
          {detail.allocations?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2 pr-3">Supplier</th><th className="py-2 pr-3">Jumlah</th><th className="py-2 pr-3">Biaya</th></tr></thead><tbody>{detail.allocations.map(allocation => {
            const supplier = suppliers.find(row => row.supplier_id === allocation.supplier_id);
            return <tr key={allocation.id || allocation.supplier_id} className="border-b border-slate-100"><td className="py-3 pr-3">{supplier?.name || allocation.supplier_id}{supplier?.distance_km != null && <span className="block text-xs font-normal tabular-nums text-slate-500">{Number(supplier.distance_km).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km dari lokasi kirim</span>}</td><td className="py-3 pr-3 tabular-nums">{formatNumber(allocation.quantity)}</td><td className="py-3 pr-3 tabular-nums">Rp {formatNumber(allocation.total_cost)}</td></tr>;
          })}</tbody></table></div> : <p className="mt-3 text-sm text-slate-500">Alokasi tersedia setelah balasan supplier dinilai.</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Status pengiriman">
          <h3 className="font-bold text-slate-900">Status pengiriman RFQ</h3>
          {suppliers.length ? <ul className="mt-4 space-y-2">{suppliers.map(supplier => <li key={supplier.supplier_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{supplier.name || supplier.supplier_id}{supplier.distance_km != null && <span className="block text-xs tabular-nums text-slate-500">{Number(supplier.distance_km).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km dari lokasi kirim</span>}</span><span className={supplier.status === 'sent' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{supplier.status === 'sent' ? 'Terkirim' : 'Gagal terkirim'}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Belum ada pengiriman ke supplier.</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Percakapan supplier">
        <h3 className="font-bold text-slate-900">Percakapan supplier</h3>
        <p className="mt-1 text-sm text-slate-500">Pesan untuk pengadaan {detail.reference_code} saja.</p>
        {messages.length ? <div className="mt-4 space-y-3">{messages.map(message => <div key={message.id} className={`rounded-lg border p-4 text-sm ${message.direction === 'inbound' ? 'border-teal-100 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span className="font-semibold">{message.direction === 'inbound' ? message.supplier_name : `Pasokin → ${message.supplier_name}`}{message.classified_as ? ` · ${message.classified_as.replaceAll('_', ' ')}` : ''}</span><span>{formatProcurementDate(message.created_at)}</span></div>
          <p className="whitespace-pre-wrap break-words text-slate-800">{message.raw_text}</p>
        </div>)}</div> : <p className="mt-3 text-sm text-slate-500">Belum ada pesan untuk pengadaan ini.</p>}
        {['needs_manual_review', 'awaiting_summary_confirmation'].includes(detail.status) && <a href={`/manual-confirmation.html?procurement_id=${encodeURIComponent(detail.id)}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Buka konfirmasi harga manual <ArrowRight size={15} /></a>}
      </section>
    </>}
  </div>;
}
