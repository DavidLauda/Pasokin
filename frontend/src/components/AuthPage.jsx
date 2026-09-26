import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Check, LockKeyhole, Truck } from 'lucide-react';
import client, { saveSession } from '../api/client';
import BrandMark from './BrandMark';

export default function AuthPage({ onAuthenticated, initialRole = 'buyer' }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quickLoginAvailable, setQuickLoginAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    client.get('/auth/quick-login-availability')
      .then(({ data }) => { if (active) setQuickLoginAvailable(data.enabled === true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) {
      setError('Konfirmasi kata sandi belum sama.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await client.post(`/auth/${mode}`, mode === 'register'
        ? { name, email, password, role } : { email, password, role });
      saveSession(data);
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Tidak dapat masuk. Coba lagi.');
    } finally { setBusy(false); }
  };

  const enterQuick = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await client.post('/auth/quick-login');
      saveSession(data);
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Quick Login gagal. Coba lagi.');
    } finally { setBusy(false); }
  };

  return <main className="pasokin-ui grid min-h-screen bg-[#f5f7f8] text-slate-900 lg:grid-cols-2">
    <section className="auth-brand-panel hidden p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
      <BrandMark inverted />
      <div className="max-w-xl"><p className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-teal-300">Platform pengadaan B2B</p><h1 className="text-4xl font-bold leading-[1.1] tracking-[-.05em] xl:text-[54px]">Pengadaan yang lebih jelas, dari permintaan hingga pembayaran.</h1><p className="mt-6 max-w-md text-base leading-7 text-slate-300">Kelola kebutuhan material, respons supplier, dan progres transaksi dalam satu ruang kerja.</p><div className="mt-10 space-y-3">{['Pantau pengadaan secara bersamaan', 'Temukan supplier yang relevan', 'Tinjau alokasi dan pembayaran'].map(label => <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium"><Check size={15} className="text-teal-300" />{label}</div>)}</div></div>
      <p className="text-xs text-slate-400">© {new Date().getFullYear()} Pasokin · Procurement workspace</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-[445px]">
        <div className="mb-9 lg:hidden"><BrandMark /></div>
        <p className="section-eyebrow text-teal-700">Mulai dari sini</p>
        <h2 className="mt-2 text-[34px] font-bold tracking-[-.045em]">{mode === 'login' ? 'Selamat datang kembali' : 'Buat akun Pasokin'}</h2>
        <p className="mt-2 text-sm text-slate-500">{mode === 'login' ? 'Masuk untuk melanjutkan pengadaan dan memantau supplier.' : 'Daftar sebagai buyer atau supplier untuk mulai berkolaborasi.'}</p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(25,52,62,.05)] sm:p-8">
        <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold" aria-label="Pilih halaman autentikasi">
          {['login', 'register'].map(value => <button key={value} type="button" onClick={() => { setMode(value); setError(''); }} className={`rounded-lg py-2.5 ${mode === value ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>{value === 'login' ? 'Masuk' : 'Daftar'}</button>)}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <fieldset><legend className="mb-2 text-sm font-semibold">{mode === 'login' ? 'Masuk sebagai' : 'Daftar sebagai'}</legend><div className="grid grid-cols-2 gap-2">
            {[['buyer', Building2, 'Buyer'], ['supplier', Truck, 'Supplier']].map(([value, Icon, label]) => <button key={value} type="button" onClick={() => { setRole(value); setError(''); }} aria-pressed={role === value} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${role === value ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </div></fieldset>
          {mode === 'register' && <>
            <label className="block text-sm font-semibold">Nama lengkap<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          </>}
          <label className="block text-sm font-semibold">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          <label className="block text-sm font-semibold">Kata sandi<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          {mode === 'register' && <label className="block text-sm font-semibold">Ulangi kata sandi<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>}
          {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          <button type="submit" disabled={busy} className="app-primary-button w-full py-3 disabled:opacity-60">{busy ? 'Memproses…' : mode === 'login' ? `Masuk sebagai ${role === 'buyer' ? 'Buyer' : 'Supplier'}` : 'Buat akun'}<ArrowRight className="h-4 w-4" /></button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">{mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="font-bold text-teal-700">{mode === 'login' ? 'Daftar sekarang' : 'Masuk di sini'}</button></p>
        {mode === 'login' && quickLoginAvailable && <div className="mt-6 border-t border-slate-200 pt-6">
          <button type="button" onClick={enterQuick} disabled={busy} className="app-secondary-button w-full py-3 disabled:opacity-60"><LockKeyhole size={15} />{busy ? 'Masuk…' : 'Quick Login ke Halaman Utama'}</button>
          <p className="mt-2 text-center text-xs text-slate-500">Masuk cepat sebagai buyer tanpa mengetik email atau kata sandi.</p>
        </div>}
        </div>
      </div>
    </section>
  </main>;
}
