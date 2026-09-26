import { useState } from 'react';
import client from '../api/client';
import SupplierLocationPicker from './SupplierLocationPicker';

const COMMON_CATEGORIES = ['Semen', 'Pasir', 'Besi', 'Baja Ringan', 'Batu Split', 'Beton', 'Kayu', 'Bata', 'Keramik'];
const inputClass = 'app-input text-sm';
const labelClass = 'app-label';

function initialData(supplier) {
  return {
    name: supplier?.name || '', phone: supplier?.phone || '',
    categories: supplier?.categories?.length ? supplier.categories : supplier?.material_category ? [supplier.material_category] : [],
    address: supplier?.address || '', lat: supplier?.lat ?? '', lng: supplier?.lng ?? '',
    max_capacity_qty: supplier?.max_capacity_qty ?? '', min_order_qty: supplier?.min_order_qty ?? '',
    unit: supplier?.unit || 'kg', price_per_unit: supplier?.price_per_unit ?? '',
    lead_time_days: supplier?.lead_time_days ?? '', payment_terms: supplier?.payment_terms || '',
    nib: supplier?.nib || '', npwp: supplier?.npwp || '',
    payout_bank: supplier?.payout_bank || '', payout_account_number: supplier?.payout_account_number || '',
    payout_account_holder: supplier?.payout_account_holder || ''
  };
}

export default function SupplierForm({ supplier = null, onSaved, onCancel, selfService = false }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialData(supplier));
  const [extraCategory, setExtraCategory] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleCategory = category => setForm(prev => ({
    ...prev, categories: prev.categories.includes(category)
      ? prev.categories.filter(item => item !== category)
      : [...prev.categories, category]
  }));

  const geocode = async () => {
    if (form.address.trim().length < 10) return;
    const address = form.address;
    const previousLat = form.lat;
    const previousLng = form.lng;
    setGeocoding(true);
    setLocationMessage('Mencari koordinat alamat…');
    try {
      const { data } = await client.post('/suppliers/geocode', { address });
      setForm(prev => prev.address === address && prev.lat === previousLat && prev.lng === previousLng
        ? { ...prev, lat: data.lat, lng: data.lng } : prev);
      setLocationMessage('Koordinat ditemukan. Periksa posisi pin pada peta.');
    } catch (requestError) {
      setLocationMessage(requestError.response?.data?.error || 'Koordinat tidak ditemukan. Pilih pin pada peta.');
    } finally {
      setGeocoding(false);
    }
  };

  const validateStep = () => {
    if (step === 0 && (!form.name.trim() || !form.phone.trim() || !form.categories.length)) {
      return 'Nama usaha, nomor kontak, dan minimal satu kategori wajib diisi.';
    }
    if (step === 1 && (!form.address.trim() || !(Number(form.max_capacity_qty) > 0) ||
      !(Number(form.min_order_qty) > 0) || Number(form.min_order_qty) > Number(form.max_capacity_qty))) {
      return 'Alamat, kapasitas, dan MOQ yang valid wajib diisi. MOQ tidak boleh melebihi kapasitas.';
    }
    if (step === 2) {
      const nib = form.nib.replace(/[.\s-]/g, '');
      const npwp = form.npwp.replace(/[.\s-]/g, '');
      if (nib && !/^\d{13}$/.test(nib)) return 'NIB harus terdiri dari 13 digit.';
      if (npwp && !/^\d{15,16}$/.test(npwp)) return 'NPWP harus terdiri dari 15 atau 16 digit.';
    }
    return '';
  };

  const next = () => {
    const problem = validateStep();
    setError(problem);
    if (!problem) setStep(value => value + 1);
  };

  const save = async event => {
    event.preventDefault();
    const problem = validateStep();
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
        max_capacity_qty: Number(form.max_capacity_qty),
        min_order_qty: Number(form.min_order_qty),
        price_per_unit: form.price_per_unit === '' ? 0 : Number(form.price_per_unit),
        lead_time_days: form.lead_time_days === '' ? 0 : Number(form.lead_time_days)
      };
      // Existing identity and payout values are not returned by public API reads.
      // Leaving these fields empty while editing must preserve their stored values.
      if (supplier) {
        for (const field of ['nib', 'npwp', 'payout_bank', 'payout_account_number', 'payout_account_holder']) {
          if (!payload[field]) delete payload[field];
        }
      }
      const { data } = selfService
        ? await client[supplier ? 'put' : 'post']('/suppliers/me', payload)
        : supplier
          ? await client.put(`/suppliers/${supplier.id}`, payload)
          : await client.post('/suppliers/register', payload);
      onSaved(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Gagal menyimpan supplier. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={save} className="space-y-5">
    <ol className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
      {['Identitas', 'Lokasi & suplai', 'Verifikasi'].map((title, index) =>
        <li key={title} className={`rounded-lg border px-2 py-2 ${index === step ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-[#f8fafa] text-slate-500'}`}>
          {index + 1}. {title}
        </li>)}
    </ol>

    {step === 0 && <div className="space-y-4">
      <div><label className={labelClass} htmlFor="supplier-name">Nama perusahaan / usaha *</label>
        <input id="supplier-name" className={inputClass} value={form.name} onChange={event => update('name', event.target.value)} required /></div>
      <div><label className={labelClass} htmlFor="supplier-phone">Nomor WhatsApp / Telegram *</label>
        <input id="supplier-phone" className={inputClass} value={form.phone} onChange={event => update('phone', event.target.value)} inputMode="tel" placeholder="62812…" required /></div>
      <fieldset><legend className={labelClass}>Kategori material *</legend>
        <div className="flex flex-wrap gap-2">{[...new Set([...COMMON_CATEGORIES, ...form.categories])].map(category =>
          <label key={category} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${form.categories.includes(category) ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
            <input type="checkbox" className="sr-only" checked={form.categories.includes(category)} onChange={() => toggleCategory(category)} />{category}
          </label>)}</div>
        <div className="mt-3 flex gap-2"><input className={inputClass} value={extraCategory} onChange={event => setExtraCategory(event.target.value)} placeholder="Kategori lain" />
          <button type="button" onClick={() => { if (extraCategory.trim()) { toggleCategory(extraCategory.trim()); setExtraCategory(''); } }} className="app-secondary-button">Tambah</button></div>
      </fieldset>
    </div>}

    {step === 1 && <div className="space-y-4">
      <div><label className={labelClass} htmlFor="supplier-address">Alamat lengkap *</label>
        <textarea id="supplier-address" rows="2" className={inputClass} value={form.address} onChange={event => { setForm(prev => ({ ...prev, address: event.target.value, lat: '', lng: '' })); setLocationMessage(''); }} required />
        <button type="button" onClick={geocode} disabled={geocoding || form.address.trim().length < 10} className="mt-2 rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-700 disabled:opacity-50">{geocoding ? 'Mencari…' : 'Cari alamat di peta'}</button>
        <p className="mt-1 text-xs text-slate-500">Opsional. Saat menyimpan, alamat akan dicari otomatis jika belum ada pin. Registrasi tetap berhasil bila alamat tidak ditemukan.</p></div>
      {locationMessage && <p className="text-xs text-slate-600" role="status">{locationMessage}</p>}
      <SupplierLocationPicker lat={form.lat} lng={form.lng} onChange={point => { setForm(prev => ({ ...prev, ...point })); setLocationMessage('Pin lokasi dipilih secara manual.'); }} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass} htmlFor="supplier-lat">Latitude</label><input id="supplier-lat" type="number" step="any" min="-90" max="90" className={inputClass} value={form.lat} onChange={event => update('lat', event.target.value)} /></div>
        <div><label className={labelClass} htmlFor="supplier-lng">Longitude</label><input id="supplier-lng" type="number" step="any" min="-180" max="180" className={inputClass} value={form.lng} onChange={event => update('lng', event.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass} htmlFor="supplier-capacity">Kapasitas suplai *</label><input id="supplier-capacity" type="number" min="0" step="any" className={`${inputClass} tabular-nums`} value={form.max_capacity_qty} onChange={event => update('max_capacity_qty', event.target.value)} required /></div>
        <div><label className={labelClass} htmlFor="supplier-moq">MOQ *</label><input id="supplier-moq" type="number" min="0" step="any" className={`${inputClass} tabular-nums`} value={form.min_order_qty} onChange={event => update('min_order_qty', event.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelClass} htmlFor="supplier-unit">Satuan</label><input id="supplier-unit" className={inputClass} value={form.unit} onChange={event => update('unit', event.target.value)} /></div>
        <div><label className={labelClass} htmlFor="supplier-price">Harga / satuan</label><input id="supplier-price" type="number" min="0" step="any" className={`${inputClass} tabular-nums`} value={form.price_per_unit} onChange={event => update('price_per_unit', event.target.value)} /></div>
        <div><label className={labelClass} htmlFor="supplier-lead">Lead time (hari)</label><input id="supplier-lead" type="number" min="0" step="any" className={`${inputClass} tabular-nums`} value={form.lead_time_days} onChange={event => update('lead_time_days', event.target.value)} /></div>
      </div>
      <div><label className={labelClass} htmlFor="supplier-terms">Termin pembayaran (opsional)</label><input id="supplier-terms" className={inputClass} value={form.payment_terms} onChange={event => update('payment_terms', event.target.value)} placeholder="Mis. 30 hari setelah pengiriman" /></div>
    </div>}

    {step === 2 && <div className="space-y-4">
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">NIB dan NPWP diperiksa berdasarkan format yang diisi sendiri. Badge Verified belum menunjukkan pemeriksaan ke database pemerintah.</p>
      <div><label className={labelClass} htmlFor="supplier-nib">NIB (13 digit)</label><input id="supplier-nib" className={inputClass} value={form.nib} onChange={event => update('nib', event.target.value)} inputMode="numeric" /></div>
      <div><label className={labelClass} htmlFor="supplier-npwp">NPWP (15 atau 16 digit)</label><input id="supplier-npwp" className={inputClass} value={form.npwp} onChange={event => update('npwp', event.target.value)} inputMode="numeric" /></div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Data rekening (opsional)</p>
      <div><label className={labelClass} htmlFor="supplier-bank">Nama bank</label><input id="supplier-bank" className={inputClass} value={form.payout_bank} onChange={event => update('payout_bank', event.target.value)} /></div>
      <div><label className={labelClass} htmlFor="supplier-account">Nomor rekening</label><input id="supplier-account" className={inputClass} value={form.payout_account_number} onChange={event => update('payout_account_number', event.target.value)} /></div>
      <div><label className={labelClass} htmlFor="supplier-holder">Nama pemilik rekening</label><input id="supplier-holder" className={inputClass} value={form.payout_account_holder} onChange={event => update('payout_account_holder', event.target.value)} /></div>
    </div>}

    {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
    <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
      <div className="flex gap-2">
        {step > 0 && <button type="button" onClick={() => { setStep(value => value - 1); setError(''); }} className="app-secondary-button">Kembali</button>}
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-500">Batal</button>}
      </div>
      {step < 2
        ? <button type="button" onClick={next} className="app-primary-button">Lanjut</button>
        : <button type="submit" disabled={saving} className="app-primary-button disabled:opacity-50">{saving ? 'Menyimpan…' : supplier ? 'Simpan perubahan' : 'Daftar sebagai supplier'}</button>}
    </div>
  </form>;
}
