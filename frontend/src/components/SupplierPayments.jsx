import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

const money = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const states = {
  awaiting_payment: 'Menunggu pembayaran buyer', paid_held: 'Dana diterima, aman untuk kirim',
  shipped: 'Menunggu konfirmasi barang diterima', delivered: 'Barang diterima',
  released: 'Pelepasan disetujui', disputed: 'Dalam review sengketa',
  expired: 'Pembayaran kedaluwarsa', refunded: 'Dana dikembalikan'
};

export default function SupplierPayments() {
  const [payments, setPayments] = useState([]);
  const [notes, setNotes] = useState({});
  const [proofs, setProofs] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { const { data } = await client.get('/payments/mine'); setPayments(data); setError(''); }
    catch { setError('Daftar pembayaran belum bisa dimuat.'); }
  }, []);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);

  const ship = async id => {
    setBusy(id); setError('');
    try {
      await client.post(`/payments/${id}/ship`, { tracking_note: notes[id], delivery_proof_url: proofs[id] });
      await refresh();
    } catch (cause) { setError(cause.response?.data?.error || 'Pengiriman gagal dicatat. Coba lagi.'); }
    finally { setBusy(null); }
  };

  return <section className="app-panel mt-6 p-6 sm:p-8" aria-label="PO dan pembayaran supplier">
    <h2 className="text-xl font-bold text-slate-900">PO dan pembayaran</h2>
    <p className="mt-1 text-sm text-slate-500">Dana yang diterima dicatat oleh Pasokin sebelum barang dikirim. Pencairan bank dilakukan terpisah.</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {payments.length === 0 ? <p className="mt-5 text-sm text-slate-500">Belum ada PO final untuk akun supplier ini.</p> :
      <div className="mt-5 space-y-4">{payments.map(payment => <article key={payment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="font-mono text-xs font-semibold text-teal-700">{payment.reference_code}</p><h3 className="mt-1 font-bold text-slate-900">{payment.material_summary}</h3></div><p className="font-bold tabular-nums">{money(payment.amount)}</p></div>
        <p className={`mt-3 font-semibold ${payment.status === 'disputed' ? 'text-amber-800' : 'text-slate-700'}`}>{states[payment.status] || payment.status}</p>
        {payment.status === 'paid_held' && <div className="mt-4 space-y-2 border-t border-slate-200 pt-4"><label className="block font-semibold" htmlFor={`note-${payment.id}`}>Nomor resi atau catatan pengiriman</label><input id={`note-${payment.id}`} value={notes[payment.id] || ''} onChange={event => setNotes(current => ({ ...current, [payment.id]: event.target.value }))} maxLength={500} className="w-full rounded-lg border border-slate-300 bg-white p-2" placeholder="Contoh: JNE123456789" /><label className="block font-semibold" htmlFor={`proof-${payment.id}`}>Tautan HTTPS foto surat jalan (opsional)</label><input id={`proof-${payment.id}`} type="url" value={proofs[payment.id] || ''} onChange={event => setProofs(current => ({ ...current, [payment.id]: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white p-2" placeholder="https://..." /><button disabled={busy === payment.id || !(notes[payment.id] || '').trim()} onClick={() => ship(payment.id)} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Tandai dikirim</button></div>}
        {payment.tracking_note && <p className="mt-2 text-slate-600">Resi/catatan: {payment.tracking_note}</p>}
        {payment.status === 'released' && <p className="mt-2 text-slate-600">{payment.payout_status === 'demo_released' ? 'Pencairan simulasi selesai.' : 'Pencairan bank menunggu proses manual dari Pasokin.'}</p>}
      </article>)}</div>}
  </section>;
}
