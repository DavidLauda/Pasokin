import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import client from '../api/client';
import { clearSession, getSession } from '../api/client';
import AuthPage from '../components/AuthPage';
import BrandMark from '../components/BrandMark';
import '../index.css';

function errorText(error) {
  return error.response?.data?.error || error.message || 'Terjadi kesalahan';
}

function ManualConfirmationPage({ onLogout }) {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get('procurement_id'));
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ price: '', unit: '', quantity: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await client.get('/manual-confirmations');
      setRows(result.data);
      if (selectedId) {
        const detail = await client.get(`/manual-confirmations/${encodeURIComponent(selectedId)}`);
        setSelected(detail.data);
      }
      setError('');
    } catch (cause) { setError(errorText(cause)); }
  }, [selectedId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  function choose(id) {
    setSelectedId(id);
    setSelected(null);
    setForm({ price: '', unit: '', quantity: '' });
    setNotice('');
    setError('');
    window.history.replaceState({}, '', id
      ? `/manual-confirmation.html?procurement_id=${encodeURIComponent(id)}`
      : '/manual-confirmation.html');
  }

  async function sendSummary(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await client.post(`/manual-confirmations/${encodeURIComponent(selectedId)}/summary`, form);
      setSelected(result.data);
      setNotice('Ringkasan dikirim. Tunggu balasan supplier untuk keputusan manual.');
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function resolve(decision) {
    setBusy(true);
    setError('');
    try {
      const result = await client.post(`/manual-confirmations/${encodeURIComponent(selectedId)}/resolve`, { decision });
      setSelected(result.data);
      if (decision === 'reject') {
        setForm({ price: '', unit: '', quantity: '' });
        setNotice('Ringkasan ditolak. Isi ulang harga, unit, dan jumlah untuk supplier yang sama.');
      } else {
        setNotice('Ringkasan dikonfirmasi dan pengadaan selesai.');
      }
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  const inbound = selected?.summary_messages?.filter(message => message.direction === 'inbound') || [];
  const latestOutbound = [...(selected?.summary_messages || [])].reverse().find(message => message.direction === 'outbound');
  const hasFreshReply = inbound.some(message => latestOutbound &&
    message.supplier_id === latestOutbound.supplier_id && message.created_at >= latestOutbound.created_at);

  return (
    <main className="pasokin-ui min-h-screen bg-[#f5f7f8] p-6 text-slate-900 md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div><BrandMark compact /><p className="section-eyebrow mt-7">Pengadaan / Review manual</p><h1 className="page-title">Konfirmasi harga manual</h1><p className="page-description">Tinjau negosiasi supplier sebelum pengadaan diselesaikan.</p></div>
          <div className="flex gap-2"><a href="/" className="app-secondary-button">Kembali ke dashboard</a><button type="button" onClick={onLogout} className="app-secondary-button">Keluar</button></div>
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</p>}
        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
          <aside className="app-panel p-4">
            <h2 className="mb-3 font-bold">Perlu ditangani</h2>
            {rows.length === 0 && <p className="text-sm text-slate-500">Belum ada pengadaan yang perlu konfirmasi manual.</p>}
            <div className="space-y-2">
              {rows.map(row => <button key={row.id} onClick={() => choose(row.id)}
                className={`w-full rounded-lg border p-3 text-left ${selectedId === row.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block text-sm font-bold">{row.reference_code}</span>
                <span className="block truncate text-sm">{row.material_summary}</span>
                <span className="text-xs text-slate-500">{row.status.replaceAll('_', ' ')}</span>
              </button>)}
            </div>
          </aside>
          <section className="app-panel p-6">
            {!selected && <p className="text-slate-500">Pilih pengadaan di sebelah kiri untuk memulai.</p>}
            {selected && <>
              <div className="mb-6 border-b border-slate-100 pb-4">
                <p className="text-sm font-bold text-teal-700">{selected.reference_code}</p>
                <h2 className="text-xl font-bold">{selected.material_summary}</h2>
                <p className="mt-1 text-sm text-slate-500">Status: {selected.status.replaceAll('_', ' ')}</p>
              </div>
              {selected.can_enter_manual_price && <form onSubmit={sendSummary} className="mb-7 space-y-4">
                <h3 className="font-bold">Masukkan hasil negosiasi secara manual</h3>
                <p className="text-sm text-slate-500">Harga tidak diambil otomatis dari percakapan. Periksa kesepakatan sebelum mengirim.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-semibold">Harga per unit (Rp)<input required min="0.01" step="any" type="number" value={form.price}
                    onChange={event => setForm({ ...form, price: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label className="text-sm font-semibold">Unit<input required maxLength="40" value={form.unit}
                    onChange={event => setForm({ ...form, unit: event.target.value })} placeholder="kg" className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label className="text-sm font-semibold">Jumlah<input required min="0.01" step="any" type="number" value={form.quantity}
                    onChange={event => setForm({ ...form, quantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                </div>
                <button disabled={busy} className="app-primary-button disabled:opacity-50">Kirim ringkasan ke supplier</button>
              </form>}
              {selected.status === 'awaiting_summary_confirmation' && <div className="mb-7 rounded-xl bg-amber-50 p-4">
                <h3 className="font-bold">Menunggu keputusan buyer</h3>
                <p className="mb-3 text-sm">{hasFreshReply ? 'Balasan supplier sudah masuk. Tinjau pesannya sebelum memutuskan.' : 'Menunggu balasan supplier untuk ringkasan terakhir.'}</p>
                <div className="flex gap-2">
                  <button disabled={busy || !hasFreshReply} onClick={() => resolve('confirm')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Konfirmasi</button>
                  <button disabled={busy || !hasFreshReply} onClick={() => resolve('reject')} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">Tolak & isi ulang</button>
                </div>
              </div>}
              <h3 className="mb-3 font-bold">Percakapan ringkasan</h3>
              <div className="space-y-3">
                {(selected.summary_messages || []).length === 0 && <p className="text-sm text-slate-500">Belum ada pesan ringkasan.</p>}
                {(selected.summary_messages || []).map(message => <div key={message.id} className={`rounded-xl p-4 text-sm ${message.direction === 'outbound' ? 'bg-slate-100' : 'bg-amber-50'}`}>
                  <p className="mb-1 font-bold">{message.direction === 'outbound' ? 'Dikirim ke supplier' : 'Balasan supplier'}</p>
                  <p className="whitespace-pre-wrap">{message.raw_text}</p>
                </div>)}
              </div>
            </>}
          </section>
        </div>
      </div>
    </main>
  );
}

function ManualConfirmationGate() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSession()));
  useEffect(() => {
    if (!getSession()) return;
    client.get('/auth/me').then(({ data }) => setUser(data.user))
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const sync = () => { if (!getSession()) setUser(null); };
    window.addEventListener('pasokin:auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('pasokin:auth-changed', sync); window.removeEventListener('storage', sync); };
  }, []);
  const logout = async () => {
    try { await client.post('/auth/logout'); }
    catch { /* Clear the browser session even if the server is unavailable. */ }
    finally { clearSession(); setUser(null); }
  };
  if (loading) return <p className="p-10 text-center text-sm text-slate-500">Memeriksa sesi…</p>;
  if (!user) return <AuthPage onAuthenticated={signedIn => { setUser(signedIn); }} />;
  if (user.role !== 'buyer') return <main className="p-10 text-center"><p>Halaman ini hanya untuk buyer.</p><button className="mt-4 rounded-xl bg-teal-700 px-4 py-2 text-white" onClick={logout}>Keluar</button></main>;
  return <ManualConfirmationPage onLogout={logout} />;
}

createRoot(document.getElementById('root')).render(<ManualConfirmationGate />);
