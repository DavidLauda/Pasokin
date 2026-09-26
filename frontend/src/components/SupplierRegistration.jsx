import { useEffect, useState } from 'react';
import { Bot, LogOut, Pencil } from 'lucide-react';
import client from '../api/client';
import SupplierForm from './SupplierForm';

export default function SupplierRegistration({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    client.get('/suppliers/me').then(({ data }) => { if (active) setProfile(data); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Gagal memuat profil supplier'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-700 p-2 text-white"><Bot className="h-5 w-5" /></span><span className="text-xl font-extrabold">Pasokin</span><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">Portal Supplier</span></div>
        <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><LogOut className="h-4 w-4" />Keluar</button>
      </header>
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Akun {user.email}</p>
        {loading ? <p className="mt-6 text-sm text-slate-500">Memuat profil…</p> : <>
          {error && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          {!profile || editing ? <>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{profile ? 'Edit profil usaha' : 'Lengkapi profil supplier'}</h1>
            <p className="mb-6 mt-2 text-sm text-slate-600">{profile ? 'Perbarui informasi usaha agar buyer mendapat data yang tepat.' : 'Isi profil usaha agar bisa dipertimbangkan dalam pengadaan material.'}</p>
            <SupplierForm key={profile?.id || 'new'} supplier={profile} selfService onCancel={profile ? () => setEditing(false) : undefined} onSaved={saved => { setProfile(saved); setEditing(false); setError(''); }} />
          </> : <>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{profile.name}</h1><p className="mt-2 text-sm text-slate-600">Profil supplier sudah terdaftar dan siap menerima RFQ.</p></div><button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white"><Pencil className="h-4 w-4" />Edit profil</button></div>
            {!profile.location_verified && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Lokasi belum ditemukan. Pilih pin pada peta lewat Edit profil agar buyer dapat melihat estimasi jarak.</p>}
            <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
              {[
                ['Status verifikasi', profile.verification_status], ['Kontak WhatsApp', profile.phone],
                ['Kategori', (profile.categories || []).join(', ')], ['Alamat', profile.address],
                ['Kapasitas', `${Number(profile.max_capacity_qty).toLocaleString('id-ID')} ${profile.unit}`],
                ['MOQ', `${Number(profile.min_order_qty).toLocaleString('id-ID')} ${profile.unit}`]
              ].map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-500">{label}</dt><dd className="mt-1 font-medium tabular-nums text-slate-900">{value || '—'}</dd></div>)}
            </dl>
          </>}
        </>}
      </div>
    </div>
  </main>;
}
