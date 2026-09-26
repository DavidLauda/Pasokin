import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Activity, Building2, Cpu, FilePlus2, History, LayoutGrid, LogOut, Radio, UsersRound } from 'lucide-react';
import NewProcurementPage from './components/NewProcurementPage';
import OptimizationDashboard from './components/OptimizationDashboard';
import SupplierManagement from './components/SupplierManagement';
import TransactionHistory from './components/TransactionHistory';
import ActiveProcurements from './components/ActiveProcurements';
import ProcurementDetail from './components/ProcurementDetail';
import client from './api/client';
import BrandMark from './components/BrandMark';

const pageMeta = {
  input: ['Pengadaan Baru', 'Buat permintaan material dan temukan supplier yang tepat.'],
  active: ['Pengadaan Aktif', 'Pantau seluruh permintaan dan respons supplier.'],
  detail: ['Detail Pengadaan', 'Lihat progres, alokasi, dan percakapan dalam satu tempat.'],
  dashboard: ['Alur Pengadaan', 'Tinjau balasan supplier dan hasil alokasi.'],
  suppliers: ['Manajemen Supplier', 'Kelola jaringan dan performa mitra supplier.'],
  history: ['Riwayat Transaksi', 'Telusuri pengadaan yang telah selesai.']
};

const navigation = [
  { id: 'input', label: 'Pengadaan Baru', icon: FilePlus2 },
  { id: 'active', label: 'Pengadaan Aktif', icon: LayoutGrid },
  { id: 'suppliers', label: 'Manajemen Supplier', mobileLabel: 'Supplier', icon: UsersRound },
  { id: 'history', label: 'Riwayat Transaksi', mobileLabel: 'Riwayat', icon: History }
];

function App({ user, onLogout }) {
  const [appState, setAppState] = useState('input');
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [selectedProcurementId, setSelectedProcurementId] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [health, setHealth] = useState({ status: 'unknown', demoMode: false });

  useEffect(() => {
    client.get('/health').then(res => setHealth(res.data)).catch(() => {
      toast.error("Tidak dapat terhubung ke server backend");
    });
  }, []);

  useEffect(() => {
    // Refresh while the buyer is signed in. Native EventSource cannot attach
    // the Authorization header required by the procurement stream.
    const timer = setInterval(() => setHistoryRefreshKey(key => key + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const handleConfirm = (data) => {
    setOptimizationResult(data);
    setSelectedProcurementId(data.dispatch_id);
    setHistoryRefreshKey(key => key + 1);
    setAppState('detail');
  };

  const handleOpenProcurementDetail = (id) => {
    setSelectedProcurementId(id);
    setAppState('detail');
  };

  const handleOpenActiveWorkflow = (procurement) => {
    if (optimizationResult?.dispatch_id === procurement.id) {
      setAppState('dashboard');
      return;
    }
    const requirement = procurement.parsed_material_summary || {};
    const candidates = (procurement.dispatched_suppliers || []).map(log => ({
      ...log.allocation_snapshot, supplier_id: log.supplier_id,
      name: log.name, phone: log.phone,
      price_per_unit: log.allocation_snapshot?.price
    }));
    setOptimizationResult({ requirement, candidates,
      optimization: { recommended_allocations: [], candidates },
      dispatch_id: procurement.id, poSent: false, isHistorical: false });
    setAppState('dashboard');
  };

  const handleOpenHistoryDetail = (historyItem) => {
    let remainingQty = historyItem.requirement.quantity > 0 ? historyItem.requirement.quantity : 0;
    const historicalAllocations = historyItem.suppliers.map(supplier => {
        const snapshot = supplier.allocation_snapshot || {};
        const capacity = Number(snapshot.max_capacity_qty ?? historyItem.requirement.quantity);
        const qty = Number(snapshot.allocated_qty ?? Math.min(Math.max(0, capacity), remainingQty));
        remainingQty = Math.max(0, remainingQty - qty);

        return {
            ...snapshot,
            supplier_id: supplier.supplier_id,
            name: supplier.name,
            phone: supplier.phone,
            price_per_unit: snapshot.price,
            qty,
            cost: qty * (snapshot.price || 0)
        };
    });

    const mockOptimizationResult = {
        requirement: historyItem.requirement,
        candidates: historyItem.suppliers.map(s => ({
            ...s.allocation_snapshot,
            supplier_id: s.supplier_id,
            name: s.name,
            phone: s.phone,
            price_per_unit: s.allocation_snapshot.price
        })),
        optimization: {
            recommended_allocations: historicalAllocations,
            ai_reasoning: null,
            savings_estimate_percent: 0,
            candidates: historicalAllocations
        },
        dispatch_id: historyItem.dispatch_id,
        poSent: historyItem.po_sent,
        isHistorical: true
    };
    setOptimizationResult(mockOptimizationResult);
    setAppState('dashboard');
  };

    const handleFinalSubmitted = () => {
        setHistoryRefreshKey(key => key + 1);
        setOptimizationResult(null);
        setAppState('history');
    };

  const toggleDemoMode = async () => {
    const newMode = !health.demoMode;
    try {
      const res = await client.post('/settings/demo-mode', { demoMode: newMode });
      setHealth(prev => ({ ...prev, demoMode: res.data.demoMode }));
      toast.success(res.data.demoMode ? "Mode Simulasi Aktif" : "Mode Live WhatsApp Aktif");
    } catch {
      toast.error("Gagal mengubah mode");
    }
  };

  const [pageTitle, pageDescription] = pageMeta[appState] || pageMeta.input;
  const isSelected = id => id === 'active' ? ['active', 'detail', 'dashboard'].includes(appState) : appState === id;

  return (
    <div className="pasokin-ui flex min-h-screen bg-[#f5f7f8] text-slate-900 selection:bg-teal-100 md:h-screen md:overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: '12px', background: '#fff', color: '#162637', border: '1px solid #dce4e8', boxShadow: '0 18px 44px rgba(17, 40, 52, 0.13)' } }} />

      <aside className="app-sidebar hidden w-[254px] shrink-0 flex-col md:flex">
        <div className="px-6 pb-8 pt-7"><BrandMark inverted /><p className="ml-[45px] mt-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Procurement workspace</p></div>
        <div className="px-4"><p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
          <nav className="space-y-1" aria-label="Menu utama">{navigation.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setAppState(id)} aria-current={isSelected(id) ? 'page' : undefined}
            className={`app-nav-item ${isSelected(id) ? 'app-nav-item-active' : ''}`}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{isSelected(id) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-300" />}</button>)}</nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><Activity size={15} className="text-teal-300" />Status sistem</div><p className="mt-2 text-xs leading-relaxed text-slate-400">{health.status === 'ok' ? 'Layanan terhubung dan siap digunakan.' : 'Memeriksa koneksi layanan…'}</p></div>
          <p className="px-2 pt-5 text-[11px] text-slate-500">© {new Date().getFullYear()} Pasokin</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <header className="app-topbar flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 md:px-9 md:py-5">
          <div className="flex min-w-0 items-center gap-4"><div className="md:hidden"><BrandMark compact /></div><div className="hidden h-9 w-px bg-slate-200 md:block" /><div className="hidden md:block"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Buyer workspace</p><p className="mt-0.5 text-sm font-bold text-slate-800">{pageTitle}</p></div></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={toggleDemoMode} aria-label={`Mode saat ini ${health.demoMode ? 'Simulasi' : 'Live'}. Ubah mode`} className={`app-mode-button ${health.demoMode ? 'app-mode-sim' : 'app-mode-live'}`}><span className="app-mode-dot" />{health.demoMode ? <Cpu size={14} /> : <Radio size={14} />}<span>{health.demoMode ? 'Simulasi' : 'Live'}</span></button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div title={user.email} className="flex items-center gap-2.5"><span className="app-avatar">{user.name?.slice(0, 2).toUpperCase() || 'BY'}</span><span className="hidden max-w-36 truncate text-xs font-semibold text-slate-700 lg:block">{user.name || user.email}</span></div>
            <button type="button" onClick={onLogout} title="Keluar" className="app-icon-button" aria-label="Keluar"><LogOut size={17} /></button>
          </div>
        </header>

        <nav className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-200 bg-white px-3 py-2 md:hidden" aria-label="Menu utama">
          {navigation.map(({ id, label, mobileLabel, icon: Icon }) => <button key={id} type="button" onClick={() => setAppState(id)} aria-current={isSelected(id) ? 'page' : undefined}
            className={`flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-2 text-left text-xs font-semibold ${isSelected(id) ? 'bg-teal-50 text-teal-800' : 'text-slate-500'}`}><Icon size={15} className="shrink-0" /><span className="truncate">{mobileLabel || label}</span></button>)}
        </nav>

        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-6 sm:px-6 md:px-9 md:pt-8">
            <div className="mx-auto max-w-[1500px] space-y-7">
                <div className="page-heading"><div><p className="section-eyebrow">Pasokin / {appState === 'detail' || appState === 'dashboard' ? 'Pengadaan Aktif / ' : ''}{pageTitle}</p><h1 className="page-title">{pageTitle}</h1><p className="page-description">{pageDescription}</p></div><div className="page-heading-mark" aria-hidden="true"><Building2 size={22} strokeWidth={1.6} /></div></div>
                
                {/* Active procurement monitoring */}
                {appState === 'active' && (
                  <ActiveProcurements
                    refreshKey={historyRefreshKey}
                    onOpenDetail={handleOpenProcurementDetail}
                  />
                )}

                {appState === 'detail' && selectedProcurementId && (
                  <ProcurementDetail
                    procurementId={selectedProcurementId}
                    refreshKey={historyRefreshKey}
                    onBack={() => setAppState('active')}
                    onOpenWorkflow={handleOpenActiveWorkflow}
                    onOpenHistory={() => setAppState('history')}
                    demoMode={health.demoMode}
                  />
                )}

                {/* New procurement entry with compact context */}
                {appState === 'input' && <NewProcurementPage onConfirm={handleConfirm} refreshKey={historyRefreshKey} />}

                {/* Dashboard State */}
                {appState === 'dashboard' && optimizationResult && (
                    <div className="space-y-4">
                        <button 
                            onClick={() => { 
                                setAppState(optimizationResult.isHistorical ? 'history' : 'active');
                            }} 
                            className="px-5 py-2 text-sm font-bold bg-slate-100 border border-slate-200 rounded-xl shadow-sm text-slate-700 hover:bg-slate-200 hover:shadow transition-all"
                        >
                            &larr; {optimizationResult.isHistorical ? 'Kembali ke Riwayat' : 'Pengadaan Aktif'}
                        </button>
                        <OptimizationDashboard 
                            data={optimizationResult}
                            demoMode={health.demoMode}
                            onFinalSubmitted={handleFinalSubmitted}
                        />
                    </div>
                )}

                {/* Supplier Management */}
                {appState === 'suppliers' && (
                    <SupplierManagement />
                )}

                {/* Transaction History */}
                {appState === 'history' && (
                    <TransactionHistory
                        refreshKey={historyRefreshKey}
                        onOpenDashboard={handleOpenHistoryDetail}
                        demoMode={health.demoMode}
                        initialProcurementId={selectedProcurementId}
                    />
                )}
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
