import { useEffect, useState } from 'react';
import App from './App';
import AuthPage from './components/AuthPage';
import SupplierRegistration from './components/SupplierRegistration';
import client, { clearSession, getSession } from './api/client';

export default function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getSession()));

  useEffect(() => {
    if (!getSession()) return;
    let active = true;
    client.get('/auth/me').then(({ data }) => { if (active) setUser(data.user); })
      .catch(() => { if (active) clearSession(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = () => { if (!getSession()) { setUser(null); setLoading(false); } };
    window.addEventListener('pasokin:auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('pasokin:auth-changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  const logout = async () => {
    try { await client.post('/auth/logout'); }
    catch { /* The local session must still end if the network is unavailable. */ }
    finally { clearSession(); setUser(null); }
  };

  if (loading) return <div className="pasokin-ui flex min-h-screen items-center justify-center bg-[#f5f7f8] text-sm font-semibold text-slate-600">Memeriksa sesi…</div>;
  if (!user) return <AuthPage onAuthenticated={setUser} initialRole={window.location.pathname.startsWith('/daftar-supplier') ? 'supplier' : 'buyer'} />;
  if (user.role === 'supplier') return <SupplierRegistration user={user} onLogout={logout} />;
  if (window.location.pathname.startsWith('/daftar-supplier')) return <main className="pasokin-ui flex min-h-screen items-center justify-center bg-[#f5f7f8] p-4"><div className="app-panel w-full max-w-md p-8 text-center"><h1 className="text-2xl font-bold">Portal supplier</h1><p className="mt-3 text-sm text-slate-600">Kamu sedang masuk sebagai buyer. Keluar untuk memakai akun supplier.</p><div className="mt-6 flex justify-center gap-3"><a href="/" className="app-secondary-button">Kembali</a><button onClick={logout} className="app-primary-button">Keluar</button></div></div></main>;
  return <App user={user} onLogout={logout} />;
}
