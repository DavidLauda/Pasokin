import { useState } from 'react';
import { ArrowRight, Bot, Building2, Truck } from 'lucide-react';
import client, { saveSession } from '../api/client';

export default function AuthPage({ onAuthenticated, initialRole = 'buyer' }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        ? { name, email, password, role } : { email, password });
      saveSession(data);
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Tidak dapat masuk. Coba lagi.');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen bg-slate-50 text-slate-900 lg:grid-cols-2">
    <section className="hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-600 p-2"><Bot className="h-6 w-6" /></span><span className="text-2xl font-extrabold">Pasokin</span></div>
      <div className="max-w-xl"><p className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-teal-300">Pengadaan material yang terhubung</p><h1 className="text-4xl font-extrabold leading-tight xl:text-5xl">Satu tempat untuk buyer dan mitra supplier.</h1><p className="mt-6 text-lg leading-relaxed text-slate-300">Kelola kebutuhan material, alokasi, dan balasan supplier dengan alur yang jelas.</p></div>
      <p className="text-sm text-slate-400">© Pasokin</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="rounded-xl bg-teal-700 p-2 text-white"><Bot className="h-5 w-5" /></span><span className="text-xl font-extrabold">Pasokin</span></div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Selamat datang</p>
        <h2 className="mt-2 text-3xl font-extrabold">{mode === 'login' ? 'Masuk ke akun' : 'Buat akun baru'}</h2>
        <p className="mt-2 text-sm text-slate-500">{mode === 'login' ? 'Gunakan email dan kata sandi yang terdaftar.' : 'Pilih peran yang sesuai untuk mulai memakai Pasokin.'}</p>
        <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold" aria-label="Pilih halaman autentikasi">
          {['login', 'register'].map(value => <button key={value} type="button" onClick={() => { setMode(value); setError(''); }} className={`rounded-lg py-2.5 ${mode === value ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>{value === 'login' ? 'Masuk' : 'Daftar'}</button>)}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && <>
            <fieldset><legend className="mb-2 text-sm font-semibold">Daftar sebagai</legend><div className="grid grid-cols-2 gap-2">
              {[['buyer', Building2, 'Buyer'], ['supplier', Truck, 'Supplier']].map(([value, Icon, label]) => <button key={value} type="button" onClick={() => setRole(value)} aria-pressed={role === value} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${role === value ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><Icon className="h-4 w-4" />{label}</button>)}
            </div></fieldset>
            <label className="block text-sm font-semibold">Nama lengkap<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          </>}
          <label className="block text-sm font-semibold">Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          <label className="block text-sm font-semibold">Kata sandi<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>
          {mode === 'register' && <label className="block text-sm font-semibold">Ulangi kata sandi<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-teal-700" /></label>}
          {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-60">{busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Buat akun'}<ArrowRight className="h-4 w-4" /></button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">{mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="font-bold text-teal-700">{mode === 'login' ? 'Daftar sekarang' : 'Masuk di sini'}</button></p>
      </div>
    </section>
  </main>;
}
