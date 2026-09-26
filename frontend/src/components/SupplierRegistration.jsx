import { useState } from 'react';
import SupplierForm from './SupplierForm';

export default function SupplierRegistration() {
  const [registered, setRegistered] = useState(null);
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-3xl">
      <a href="/" className="text-sm font-bold text-teal-700">← Pasokin</a>
      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {registered ? <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</div>
          <h1 className="text-2xl font-extrabold">Pendaftaran berhasil</h1>
          <p className="text-slate-600">{registered.name} sudah terdaftar. Tim Pasokin dapat menghubungi nomor kontak yang Anda berikan untuk RFQ.</p>
          <p className="text-sm text-slate-500">Status: {registered.verification_status === 'verified' ? 'Verified (format NIB dan NPWP)' : registered.verification_status === 'pending' ? 'Menunggu data verifikasi lengkap' : 'Belum terverifikasi'}</p>
          <button type="button" onClick={() => setRegistered(null)} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white">Daftarkan supplier lain</button>
        </div> : <>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Mitra Pasokin</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Daftar sebagai supplier</h1>
          <p className="mb-6 mt-2 text-sm text-slate-600">Isi profil usaha agar bisa dipertimbangkan dalam pengadaan material.</p>
          <SupplierForm key={registered?.id || 'new'} onSaved={setRegistered} />
        </>}
      </div>
    </div>
  </main>;
}
