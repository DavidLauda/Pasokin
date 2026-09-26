import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Bot, Cpu, LogOut } from 'lucide-react';
import NewProcurementPage from './components/NewProcurementPage';
import OptimizationDashboard from './components/OptimizationDashboard';
import SupplierManagement from './components/SupplierManagement';
import TransactionHistory from './components/TransactionHistory';
import ActiveProcurements from './components/ActiveProcurements';
import ProcurementDetail from './components/ProcurementDetail';
import client from './api/client';

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
    } catch (err) {
      toast.error("Gagal mengubah mode");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-teal-200">
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: '1rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', color: '#1e293b', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)' } }} />

      {/* Abstract Glow Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-60 z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-slate-200 blur-[120px]"></div>
          <div className="absolute top-[40%] right-[10%] w-[40%] h-[50%] rounded-full bg-slate-300 blur-[120px]"></div>
      </div>

      {/* LEFT SIDEBAR */}
      <aside className="relative z-10 w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col hidden md:flex shadow-sm">
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
            <div className="bg-teal-700 p-2 rounded-xl shadow-sm mr-3">
                <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Pasokin</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1 rounded">Beta</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            <div className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Menu Utama</div>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('input');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'input' ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'input' ? 'bg-teal-700' : 'bg-transparent'}`}></div>
                Pengadaan Baru
            </a>
            <a href="#" onClick={(e) => {
                e.preventDefault();
                setAppState('active');
            }} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${['active', 'detail', 'dashboard'].includes(appState) ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${['active', 'detail', 'dashboard'].includes(appState) ? 'bg-teal-700' : 'bg-transparent'}`}></div>
                Pengadaan Aktif
            </a>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('suppliers');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'suppliers' ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'suppliers' ? 'bg-teal-700' : 'bg-transparent'}`}></div>
                Manajemen Supplier
            </a>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('history');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'history' ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'history' ? 'bg-teal-700' : 'bg-transparent'}`}></div>
                Riwayat Transaksi
            </a>

        </div>

        <div className="p-4 mb-4 mx-4 rounded-2xl bg-slate-50 border border-slate-200">
            <h4 className="text-slate-800 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Cpu className="h-3 w-3 text-slate-500"/> Pembaruan AI</h4>
            <p className="text-slate-500 text-xs leading-relaxed">Model negosiasi v2.1 sekarang aktif. Evaluasi harga 30% lebih akurat.</p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        
        <header className="relative z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:h-20 md:px-8">
            <div className="flex items-center gap-4">
                <h1 className="text-lg font-extrabold text-slate-900 md:text-2xl">
                    {appState === 'detail' ? 'Detail Pengadaan' :
                     appState === 'active' ? 'Pengadaan Aktif' :
                     appState === 'input' ? 'Pengadaan Baru' :
                     appState === 'dashboard' ? 'Dashboard Pengadaan' :
                     appState === 'suppliers' ? 'Manajemen Supplier' :
                     appState === 'history' ? 'Riwayat Transaksi' : 'Dashboard'}
                </h1>
            </div>
            
            <div className="flex items-center gap-4">
                <button 
                  onClick={toggleDemoMode}
                  className="relative hidden w-[180px] rounded-full border border-slate-200 bg-slate-100 p-1 shadow-inner sm:flex"
                >
                  <div className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 shadow-sm ${health.demoMode ? 'translate-x-0 bg-amber-400' : 'translate-x-[100%] bg-emerald-400'}`}></div>
                  <div className={`relative z-10 flex-1 text-center py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${health.demoMode ? 'text-white' : 'text-slate-500'}`}>
                      <Cpu className="h-3 w-3" /> Simulasi
                  </div>
                  <div className={`relative z-10 flex-1 text-center py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${!health.demoMode ? 'text-white' : 'text-slate-500'}`}>
                      <Bot className="h-3 w-3" /> Live
                  </div>
                </button>
                <div title={user.email} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 font-bold text-slate-600 shadow-sm md:h-10 md:w-10">
                    {user.name?.slice(0, 2).toUpperCase() || 'BY'}
                </div>
                <button type="button" onClick={onLogout} title="Keluar" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Keluar</span></button>
            </div>
        </header>

        <nav className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden" aria-label="Menu utama">
          {[
            ['input', 'Pengadaan Baru'], ['active', 'Pengadaan Aktif'],
            ['suppliers', 'Supplier'], ['history', 'Riwayat']
          ].map(([value, label]) => {
            const selected = value === 'active' ? ['active', 'detail', 'dashboard'].includes(appState) : appState === value;
            return <button key={value} type="button" onClick={() => setAppState(value)} aria-current={selected ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label}
            </button>;
          })}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-[1600px] mx-auto space-y-8">
                
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
