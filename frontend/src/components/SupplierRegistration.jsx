import { useEffect, useState } from 'react';
import { LogOut, Pencil } from 'lucide-react';
import client from '../api/client';
import SupplierForm from './SupplierForm';
import SupplierPayments from './SupplierPayments';
import BrandMark from './BrandMark';

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

  return <main className="pasokin-ui min-h-screen bg-[#f5f7f8] text-slate-900">
    <header className="app-topbar px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5"><BrandMark compact /><span className="border-l border-slate-200 pl-4 text-xs font-bold uppercase tracking-[.13em] text-slate-500">Portal Supplier</span></div>
        <button type="button" onClick={onLogout} className="app-secondary-button"><LogOut className="h-4 w-4" />Keluar</button>
      </div></header>
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:px-8">
      <div className="mb-6"><p className="section-eyebrow">Workspace / Supplier</p><h1 className="page-title">Profil usaha</h1><p className="page-description">Kelola informasi perusahaan dan pantau pembayaran Anda.</p></div>
      <div className="max-w-4xl">
      <div className="app-panel p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Akun {user.email}</p>
        {loading ? <p className="mt-6 text-sm text-slate-500">Memuat profil…</p> : <>
          {error && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
          {!profile || editing ? <>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{profile ? 'Edit profil usaha' : 'Lengkapi profil supplier'}</h1>
            <p className="mb-6 mt-2 text-sm text-slate-600">{profile ? 'Perbarui informasi usaha agar buyer mendapat data yang tepat.' : 'Isi profil usaha agar bisa dipertimbangkan dalam pengadaan material.'}</p>
            <SupplierForm key={profile?.id || 'new'} supplier={profile} selfService onCancel={profile ? () => setEditing(false) : undefined} onSaved={saved => { setProfile(saved); setEditing(false); setError(''); }} />
          </> : <>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{profile.name}</h1><p className="mt-2 text-sm text-slate-600">Profil supplier sudah terdaftar dan siap menerima RFQ.</p></div><button type="button" onClick={() => setEditing(true)} className="app-primary-button"><Pencil className="h-4 w-4" />Edit profil</button></div>
            {!profile.location_verified && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Lokasi belum ditemukan. Pilih pin pada peta lewat Edit profil agar buyer dapat melihat estimasi jarak.</p>}
            {!(profile.payout_bank && profile.payout_account_number && profile.payout_account_holder) && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Lengkapi bank, nomor rekening, dan nama pemilik rekening melalui Edit profil sebelum pencairan bank diproses.</p>}
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
      {profile && !editing && <SupplierPayments />}
      </div>
    </div>
  </main>;
}
