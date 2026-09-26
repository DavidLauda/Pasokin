import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

const labels = {
  awaiting_payment: 'Menunggu pembayaran', paid_held: 'Dana diterima, menunggu pengiriman',
  shipped: 'Barang dikirim', delivered: 'Barang diterima', released: 'Pelepasan dana dicatat',
  expired: 'Pembayaran kedaluwarsa', disputed: 'Dalam review sengketa', refunded: 'Dana dikembalikan'
};
const money = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const errorMessage = error => error.response?.data?.error || 'Aksi pembayaran gagal. Coba lagi.';

function PaymentCard({ payment, demoMode, onChanged, now }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const remaining = payment.expires_at ? Math.max(0, Math.ceil((new Date(payment.expires_at).getTime() - now) / 60000)) : null;

  const action = async (path, body = {}) => {
    setBusy(true); setError('');
    try { await client.post(`/payments/${payment.id}/${path}`, body); await onChanged(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2">
      <div><h4 className="font-bold text-slate-900">{payment.supplier_name}</h4>
        <p className="mt-1 tabular-nums text-slate-600">{payment.quantity != null ? `${Number(payment.quantity).toLocaleString('id-ID')} × ${money(payment.price_per_unit)}` : 'PO supplier'}</p></div>
      <div className="text-right"><p className="font-bold tabular-nums text-slate-900">{money(payment.amount)}</p>
        <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${payment.status === 'disputed' || payment.status === 'expired' ? 'bg-amber-100 text-amber-800' : payment.status === 'released' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{labels[payment.status] || payment.status}</span></div>
    </div>
    {payment.status === 'awaiting_payment' && <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      {payment.va_reference ? <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Virtual Account {payment.payment_method}</p><p className="mt-1 break-all text-lg font-bold tabular-nums text-teal-800">{payment.va_reference}</p><p className="mt-1 text-xs text-slate-500">{remaining === 0 ? 'Waktu bayar habis; menunggu konfirmasi gateway.' : `Berlaku sekitar ${remaining} menit lagi`}</p></div> : demoMode ?
        <button disabled={busy} onClick={() => action('demo/pay')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Simulasi: Bayar</button> :
        <div><p className="mb-2 text-slate-600">Pilih metode pembayaran. QRIS belum tersedia pada versi ini.</p><button disabled={busy} onClick={() => action('request', { bank: 'BCA' })} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Buat VA BCA sandbox</button></div>}
      <p className="text-xs text-slate-500">Pembayaran sandbox memakai dana uji. Dana yang diterima dicatat di saldo merchant Pasokin, bukan escrow berlisensi.</p>
    </div>}
    {payment.status === 'paid_held' && <div className="mt-3"><p className="text-slate-600">Supplier sudah diberi tahu. Tunggu informasi pengiriman.</p>{demoMode && payment.is_demo && <button disabled={busy} onClick={() => action('demo/ship')} className="mt-3 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Simulasi: Kirim Barang</button>}</div>}
    {payment.status === 'shipped' && <div className="mt-3 space-y-2"><p className="text-slate-600">Resi/catatan: {payment.tracking_note || '—'}</p>
      {payment.delivery_proof_url && <a href={payment.delivery_proof_url} target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">Lihat bukti pengiriman</a>}
      <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => action('receive')} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{demoMode ? 'Simulasi: Barang Tiba' : 'Barang diterima'}</button><button disabled={busy} onClick={() => setShowDispute(value => !value)} className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-800">Ada masalah</button></div>
    </div>}
    {payment.status === 'paid_held' && <button disabled={busy} onClick={() => setShowDispute(value => !value)} className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-800">Ada masalah</button>}
    {showDispute && <div className="mt-3 space-y-2"><label className="block text-xs font-semibold text-slate-600" htmlFor={`dispute-${payment.id}`}>Jelaskan masalah</label><textarea id={`dispute-${payment.id}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="w-full rounded-lg border border-slate-300 p-2" /><button disabled={busy || reason.trim().length < 5} onClick={() => action('dispute', { reason })} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Kirim untuk review manual</button></div>}
    {payment.status === 'disputed' && <p className="mt-3 text-amber-800">{payment.dispute_reason} · Tim Pasokin perlu meninjau sebelum dana dilepas.</p>}
    {payment.status === 'released' && <p className="mt-3 text-slate-600">{payment.payout_status === 'demo_released' ? 'Pelepasan dana simulasi selesai.' : 'Pelepasan dana disetujui. Transfer bank ke supplier menunggu proses manual.'}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-rose-800">{error}</p>}
  </article>;
}

export default function PaymentPanel({ procurementId, demoMode }) {
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    try { const { data } = await client.get(`/payments/procurement/${encodeURIComponent(procurementId)}`); setPayments(data); setError(''); }
    catch { setError('Status pembayaran belum bisa dimuat.'); }
  }, [procurementId]);
  useEffect(() => { refresh(); const poll = setInterval(refresh, 5000); const clock = setInterval(() => setNow(Date.now()), 30000); return () => { clearInterval(poll); clearInterval(clock); }; }, [refresh]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Pembayaran per supplier">
    <h3 className="font-bold text-slate-900">Pembayaran per supplier</h3>
    <p className="mt-1 text-sm text-slate-500">Setiap supplier memiliki tagihan dan status pengiriman sendiri. Status diperbarui otomatis.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {payments.length ? <div className="mt-4 space-y-3">{payments.map(payment => <PaymentCard key={payment.id} payment={payment} demoMode={demoMode} onChanged={refresh} now={now} />)}</div> :
      <p className="mt-4 text-sm text-slate-500">Tagihan akan muncul setelah PO final dikirim ke supplier.</p>}
  </section>;
}
