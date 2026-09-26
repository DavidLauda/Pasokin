import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';
import SupplierForm from './SupplierForm';

const verificationText = { verified: 'Verified', pending: 'Pending', unverified: 'Unverified' };
const verificationClass = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  unverified: 'border-slate-200 bg-slate-50 text-slate-600'
};
const formatNumber = value => Number(value || 0).toLocaleString('id-ID');
const formatDate = value => value ? new Date(value).toLocaleString('id-ID') : '—';

function VerifiedBadge({ status }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${verificationClass[status] || verificationClass.unverified}`}>
    {status === 'verified' && <CheckCircle2 className="h-3.5 w-3.5" />}{verificationText[status] || 'Unverified'}
  </span>;
}

export default function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [verification, setVerification] = useState('');
  const [sort, setSort] = useState('name');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [privateVisible, setPrivateVisible] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/suppliers');
      setSuppliers(data);
    } catch {
      toast.error('Gagal memuat supplier');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setPrivateVisible(false);
    let active = true;
    setDetailLoading(true);
    client.get(`/suppliers/${selectedId}`).then(({ data }) => {
      if (active) setDetail(data);
    }).catch(() => {
      if (active) toast.error('Gagal memuat detail supplier');
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const categories = useMemo(() => [...new Set(suppliers.flatMap(item => item.categories?.length ? item.categories : [item.material_category]).filter(Boolean))].sort(), [suppliers]);
  const visible = useMemo(() => suppliers.filter(item => {
    const haystack = [item.name, item.address, item.location, ...(item.categories || [])].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase()) &&
      (!category || (item.categories || [item.material_category]).includes(category)) &&
      (!verification || item.verification_status === verification);
  }).sort((a, b) => {
    if (sort === 'reliability') return Number(b.reliability_score) - Number(a.reliability_score);
    if (sort === 'recent') return new Date(b.created_at) - new Date(a.created_at);
    return a.name.localeCompare(b.name, 'id');
  }), [suppliers, query, category, verification, sort]);

  const remove = async supplier => {
    if (!window.confirm(`Hapus ${supplier.name} dari daftar aktif?`)) return;
    try {
      await client.delete(`/suppliers/${supplier.id}`);
      if (selectedId === supplier.id) setSelectedId(null);
      await refresh();
      toast.success('Supplier dihapus dari daftar aktif');
    } catch { toast.error('Gagal menghapus supplier'); }
  };

  const unlockPrivate = async event => {
    event.preventDefault();
    try {
      const { data } = await client.get(`/suppliers/admin/${selectedId}`, {
        headers: { 'x-pasokin-admin-token': adminToken }
      });
      setDetail(data);
      setPrivateVisible(true);
      setAdminToken('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Gagal membuka data lengkap');
    }
  };

  return <section className="space-y-5 pb-16">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div><h2 className="text-xl font-extrabold">Manajemen Supplier</h2><p className="mt-1 text-sm text-slate-500">{formatNumber(suppliers.length)} supplier terdaftar</p></div>
      <div className="flex flex-wrap gap-2">
        <a href="/daftar-supplier" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Lihat form publik</a>
        <button type="button" onClick={() => { setEditing(null); setFormOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Tambah Supplier</button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Cari supplier</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, lokasi…" className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" /></label>
      <label className="relative"><span className="sr-only">Filter kategori</span><select value={category} onChange={event => setCategory(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Semua kategori</option>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /></label>
      <label className="relative"><span className="sr-only">Filter verifikasi</span><select value={verification} onChange={event => setVerification(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Semua status</option>{Object.entries(verificationText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /></label>
      <label className="relative"><span className="sr-only">Urutkan supplier</span><select value={sort} onChange={event => setSort(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="name">Nama A–Z</option><option value="reliability">Reliability tertinggi</option><option value="recent">Terbaru</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /></label>
    </div>

    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Supplier</th><th className="px-5 py-4">Kategori</th><th className="px-5 py-4">Lokasi</th><th className="px-5 py-4">Verifikasi</th><th className="px-5 py-4 text-right">Reliability</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan="5" className="px-5 py-10 text-center text-slate-500">Memuat supplier…</td></tr>
          : visible.length === 0 ? <tr><td colSpan="5" className="px-5 py-10 text-center text-slate-500">Tidak ada supplier yang cocok.</td></tr>
          : visible.map(item => <tr key={item.id} onClick={() => setSelectedId(item.id)} onKeyDown={event => { if (event.key === 'Enter') setSelectedId(item.id); }} tabIndex={0} className="cursor-pointer hover:bg-slate-50 focus:bg-teal-50">
            <td className="px-5 py-4 font-bold text-slate-900">{item.name}</td><td className="px-5 py-4 text-slate-600">{(item.categories?.length ? item.categories : [item.material_category]).join(', ')}</td><td className="max-w-64 truncate px-5 py-4 text-slate-600">{item.address || item.location || '—'}</td><td className="px-5 py-4"><VerifiedBadge status={item.verification_status} /></td><td className="px-5 py-4 text-right font-semibold tabular-nums">{Math.round(Number(item.reliability_score ?? 0.5) * 100)}%</td>
          </tr>)}</tbody>
      </table>
    </div>

    {selectedId && <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={() => setSelectedId(null)}><aside onClick={event => event.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" aria-label="Detail supplier">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">Detail supplier</p><h3 className="mt-1 text-xl font-extrabold">{detail?.name || 'Memuat…'}</h3></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Tutup detail" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      {detailLoading || !detail ? <p className="mt-8 text-sm text-slate-500">Memuat detail…</p> : <div className="mt-6 space-y-6">
        <VerifiedBadge status={detail.verification_status} />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Kontak', detail.phone], ['Kategori', (detail.categories || []).join(', ')],
            ['Alamat', detail.address || detail.location], ['Koordinat', detail.lat != null && detail.lng != null ? `${detail.lat}, ${detail.lng}` : 'Belum ditentukan'],
            ['Kapasitas', `${formatNumber(detail.max_capacity_qty)} ${detail.unit}`], ['MOQ', `${formatNumber(detail.min_order_qty)} ${detail.unit}`],
            ['Harga / satuan', `Rp ${formatNumber(detail.price_per_unit)}`], ['Lead time', `${formatNumber(detail.lead_time_days)} hari`],
            ['Termin pembayaran', detail.payment_terms || '—'], ['Reliability', `${Math.round(Number(detail.reliability_score ?? 0.5) * 100)}%`]
          ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium tabular-nums">{value || '—'}</dd></div>)}
        </dl>
        {privateVisible ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-bold">Data legal dan rekening</h4><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {[
            ['NIB', detail.nib], ['NPWP', detail.npwp], ['Bank', detail.payout_bank],
            ['Nomor rekening', detail.payout_account_number], ['Pemilik rekening', detail.payout_account_holder]
          ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-all font-medium tabular-nums">{value || '—'}</dd></div>)}
        </dl></div> : <form onSubmit={unlockPrivate} className="rounded-xl border border-slate-200 p-4"><label htmlFor="supplier-admin-token" className="block text-sm font-semibold">Data legal dan rekening</label><p className="mt-1 text-xs text-slate-500">Masukkan kunci admin untuk melihat data lengkap.</p><div className="mt-3 flex gap-2"><input id="supplier-admin-token" type="password" autoComplete="off" value={adminToken} onChange={event => setAdminToken(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="submit" className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white">Buka</button></div></form>}
        <div className="flex gap-2"><button type="button" onClick={() => { setEditing(detail); setSelectedId(null); setFormOpen(true); }} className="rounded-xl border border-teal-700 px-4 py-2 text-sm font-bold text-teal-700">Edit supplier</button><button type="button" onClick={() => remove(detail)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Hapus</button></div>
        <div><h4 className="font-bold">Riwayat transaksi</h4>{detail.transactions?.length ? <ul className="mt-3 space-y-2">{detail.transactions.map(transaction => <li key={transaction.id} className="flex justify-between rounded-xl border border-slate-200 p-3 text-sm"><span>{formatDate(transaction.occurred_at)}</span><span className="font-semibold tabular-nums">Skor {Number(transaction.outcome_score).toFixed(1)}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Belum ada transaksi. Skor awal supplier adalah 50%.</p>}</div>
      </div>}
    </aside></div>}

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" onClick={() => setFormOpen(false)}><div onClick={event => event.stopPropagation()} className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex justify-between"><h3 className="text-xl font-extrabold">{editing ? 'Edit Supplier' : 'Tambah Supplier'}</h3><button type="button" onClick={() => setFormOpen(false)} aria-label="Tutup form"><X className="h-5 w-5" /></button></div>
      <SupplierForm key={editing?.id || 'new'} supplier={editing} onCancel={() => setFormOpen(false)} onSaved={async saved => { setFormOpen(false); await refresh(); if (editing) setSelectedId(saved.id); toast.success(editing ? 'Supplier diperbarui' : 'Supplier ditambahkan'); }} />
    </div></div>}
  </section>;
}
