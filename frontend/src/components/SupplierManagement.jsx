import { useState, useEffect } from 'react';
import { Package, MapPin, Truck, Plus, Search, Edit2, Trash2, X, Star, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../api/client';

export default function SupplierManagement() {
    const [suppliers, setSuppliers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form state for creating/editing
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        material_category: '',
        price_per_unit: '',
        unit: 'kg',
        min_order_qty: '',
        max_capacity_qty: '',
        lead_time_days: '',
        location: '',
        phone: '',
        reliability_score: 0.8
    });

    const fetchSuppliers = async () => {
        setIsLoading(true);
        try {
            const res = await client.get('/suppliers');
            setSuppliers(res.data);
        } catch (error) {
            toast.error("Gagal memuat data supplier");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const openModal = (supplier = null) => {
        if (supplier) {
            setFormData({ ...supplier });
        } else {
            setFormData({
                id: '',
                name: '',
                material_category: '',
                price_per_unit: '',
                unit: 'kg',
                min_order_qty: '',
                max_capacity_qty: '',
                lead_time_days: '',
                location: '',
                phone: '',
                reliability_score: 0.8
            });
        }
        setIsModalOpen(true);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        
        // Validation and number conversion
        const payload = {
            ...formData,
            price_per_unit: Number(formData.price_per_unit),
            min_order_qty: Number(formData.min_order_qty),
            max_capacity_qty: Number(formData.max_capacity_qty),
            lead_time_days: Number(formData.lead_time_days),
            reliability_score: Number(formData.reliability_score)
        };

        try {
            if (formData.id) {
                await client.put(`/suppliers/${formData.id}`, payload);
                toast.success("Supplier berhasil diperbarui");
            } else {
                await client.post('/suppliers', payload);
                toast.success("Supplier berhasil ditambahkan");
            }
            setIsModalOpen(false);
            fetchSuppliers();
        } catch (error) {
            toast.error("Gagal menyimpan data supplier");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Apakah Anda yakin ingin menghapus supplier ini?")) return;
        
        try {
            await client.delete(`/suppliers/${id}`);
            toast.success("Supplier berhasil dihapus");
            fetchSuppliers();
        } catch (error) {
            toast.error("Gagal menghapus supplier");
        }
    };

    const filteredSuppliers = suppliers.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.material_category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.location.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full space-y-6 pb-20">
            {/* Header & Stats */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <div className="w-2 h-6 bg-amber-500 rounded-full"></div> 
                        Database Supplier
                    </h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">Kelola data vendor dan penilaian performa AI</p>
                </div>
                <button 
                    onClick={() => openModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-extrabold rounded-xl shadow-lg shadow-amber-500/20 transition-all"
                >
                    <Plus className="h-4 w-4" /> Tambah Supplier
                </button>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Cari berdasarkan nama, kategori, atau lokasi..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium text-slate-900"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                                <th className="p-5">Supplier</th>
                                <th className="p-5">Kategori & Harga</th>
                                <th className="p-5">Pengiriman</th>
                                <th className="p-5">Skor AI</th>
                                <th className="p-5 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-slate-400 font-bold">Memuat data...</td>
                                </tr>
                            ) : filteredSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-slate-400 font-bold">Tidak ada data ditemukan.</td>
                                </tr>
                            ) : (
                                filteredSuppliers.map(supplier => (
                                    <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-5">
                                            <div className="font-extrabold text-slate-900">{supplier.name}</div>
                                            <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                                                <MapPin className="h-3 w-3" /> {supplier.location}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100 mb-1">
                                                <Package className="h-3 w-3" /> {supplier.material_category}
                                            </span>
                                            <div className="text-sm font-bold text-slate-700">
                                                Rp {new Intl.NumberFormat('id-ID').format(supplier.price_per_unit)}<span className="text-xs text-slate-400">/{supplier.unit}</span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                                <Truck className="h-4 w-4 text-slate-400" /> {supplier.lead_time_days} Hari
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 font-medium">
                                                Kapasitas: {supplier.max_capacity_qty} {supplier.unit}
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full ${supplier.reliability_score >= 0.9 ? 'bg-emerald-400' : supplier.reliability_score >= 0.8 ? 'bg-amber-400' : 'bg-red-400'}`} 
                                                        style={{width: `${supplier.reliability_score * 100}%`}}
                                                    ></div>
                                                </div>
                                                <span className="text-sm font-bold text-slate-700">{Math.round(supplier.reliability_score * 100)}%</span>
                                            </div>
                                        </td>
                                        <td className="p-5 text-right space-x-2">
                                            <button 
                                                onClick={() => openModal(supplier)}
                                                className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(supplier.id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Hapus"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                                {formData.id ? <Edit2 className="h-5 w-5 text-amber-500" /> : <Plus className="h-5 w-5 text-amber-500" />}
                                {formData.id ? 'Edit Supplier' : 'Tambah Supplier Baru'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <form id="supplierForm" onSubmit={handleSave} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Nama Perusahaan</label>
                                        <input required type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Kategori Material</label>
                                        <input required type="text" name="material_category" value={formData.material_category} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Harga per Unit</label>
                                        <input required type="number" name="price_per_unit" value={formData.price_per_unit} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Satuan</label>
                                        <input required type="text" name="unit" value={formData.unit} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Lead Time (Hari)</label>
                                        <input required type="number" name="lead_time_days" value={formData.lead_time_days} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Min Order Qty</label>
                                        <input required type="number" name="min_order_qty" value={formData.min_order_qty} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Max Kapasitas</label>
                                        <input required type="number" name="max_capacity_qty" value={formData.max_capacity_qty} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Skor AI (0.0 - 1.0)</label>
                                        <input required type="number" step="0.01" min="0" max="1" name="reliability_score" value={formData.reliability_score} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Lokasi</label>
                                        <input required type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Nomor WhatsApp (Contoh: 6281...)</label>
                                    <input required type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-900" />
                                </div>
                            </form>
                        </div>
                        
                        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                            <button form="supplierForm" type="submit" className="flex items-center gap-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold rounded-xl shadow-lg shadow-amber-500/20 transition-all">
                                <Save className="h-4 w-4" /> Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
