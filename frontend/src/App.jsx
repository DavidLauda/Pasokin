import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Bot, Cpu } from 'lucide-react';
import RequirementForm from './components/RequirementForm';
import OptimizationDashboard from './components/OptimizationDashboard';
import SupplierManagement from './components/SupplierManagement';
import TransactionHistory from './components/TransactionHistory';
import client from './api/client';

function App() {
  const [appState, setAppState] = useState('input'); // 'input' | 'loading_dashboard' | 'dashboard' | 'suppliers'
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [health, setHealth] = useState({ status: 'unknown', demoMode: false });

  useEffect(() => {
    client.get('/health').then(res => setHealth(res.data)).catch(() => {});
  }, []);

  const handleConfirm = (data) => {
    setOptimizationResult(data);
    setAppState('dashboard');
  };

  const handleOpenHistoryDetail = (historyItem) => {
    // Reconstruct the optimizationResult from history logs
    const mockOptimizationResult = {
        requirement: historyItem.requirement,
        optimization: {
            recommended_allocations: historyItem.suppliers.map(s => ({
                ...s.allocation_snapshot,
                supplier_id: s.supplier_id,
                name: s.name,
                phone: s.phone,
                price_per_unit: s.allocation_snapshot.price
            })),
            ai_reasoning: "Transaksi ini direkonstruksi dari riwayat.",
            savings_estimate_percent: 0,
            candidates: historyItem.suppliers.map(s => ({
                ...s.allocation_snapshot,
                supplier_id: s.supplier_id,
                name: s.name,
                phone: s.phone,
                price_per_unit: s.allocation_snapshot.price
            }))
        },
        dispatch_id: historyItem.dispatch_id,
        isHistorical: true
    };
    setOptimizationResult(mockOptimizationResult);
    setAppState('dashboard');
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
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-amber-200">
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: '1rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', color: '#1e293b', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)' } }} />

      {/* Abstract Glow Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-60 z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-amber-200 blur-[120px]"></div>
          <div className="absolute top-[40%] right-[10%] w-[40%] h-[50%] rounded-full bg-slate-300 blur-[120px]"></div>
      </div>

      {/* LEFT SIDEBAR */}
      <aside className="relative z-10 w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col hidden md:flex shadow-sm">
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
            <div className="bg-amber-400 p-2 rounded-xl shadow-sm mr-3">
                <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Pasokin</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1 rounded">Beta</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            <div className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Menu Utama</div>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('input'); setOptimizationResult(null);}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${['input', 'loading_dashboard', 'dashboard'].includes(appState) ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${['input', 'loading_dashboard', 'dashboard'].includes(appState) ? 'bg-amber-500' : 'bg-transparent'}`}></div>
                Pengadaan Aktif
            </a>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('suppliers');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'suppliers' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'suppliers' ? 'bg-amber-500' : 'bg-transparent'}`}></div>
                Manajemen Supplier
            </a>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('history');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'history' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'history' ? 'bg-amber-500' : 'bg-transparent'}`}></div>
                Riwayat Transaksi
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-all">
                <div className="w-1.5 h-4 bg-transparent rounded-full"></div>
                Laporan & Analitik
            </a>
        </div>

        <div className="p-4 mb-4 mx-4 rounded-2xl bg-slate-50 border border-slate-200">
            <h4 className="text-slate-800 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Cpu className="h-3 w-3 text-amber-500"/> Pembaruan AI</h4>
            <p className="text-slate-500 text-xs leading-relaxed">Model negosiasi v2.1 sekarang aktif. Evaluasi harga 30% lebih akurat.</p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        
        <header className="h-20 flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-extrabold text-slate-900">
                    {appState === 'input' ? 'Pengadaan Baru' : 
                     appState === 'dashboard' || appState === 'loading_dashboard' ? 'Dashboard Pengadaan' : 
                     appState === 'suppliers' ? 'Manajemen Supplier' : 'Dashboard'}
                </h1>
            </div>
            
            <div className="flex items-center gap-4">
                <button 
                  onClick={toggleDemoMode}
                  className="flex bg-slate-100 rounded-full p-1 border border-slate-200 relative w-[180px] shadow-inner"
                >
                  <div className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 shadow-sm ${health.demoMode ? 'translate-x-0 bg-amber-400' : 'translate-x-[100%] bg-emerald-400'}`}></div>
                  <div className={`relative z-10 flex-1 text-center py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${health.demoMode ? 'text-white' : 'text-slate-500'}`}>
                      <Cpu className="h-3 w-3" /> Simulasi
                  </div>
                  <div className={`relative z-10 flex-1 text-center py-1.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${!health.demoMode ? 'text-white' : 'text-slate-500'}`}>
                      <Bot className="h-3 w-3" /> Live
                  </div>
                </button>
                <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 font-bold shadow-sm">
                    AD
                </div>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-[1600px] mx-auto space-y-8">
                
                {/* Input State */}
                {appState === 'input' && (
                    <div className="flex justify-center pt-8">
                        <RequirementForm 
                            onConfirm={handleConfirm}
                            onLoadingStart={() => setAppState('loading_dashboard')}
                            onError={() => setAppState('input')}
                        />
                    </div>
                )}

                {/* Loading State */}
                {appState === 'loading_dashboard' && (
                    <div className="w-full mx-auto space-y-6 animate-pulse">
                        <div className="bg-slate-200 h-24 rounded-3xl w-full"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-slate-200 h-40 rounded-3xl"></div>
                            <div className="bg-slate-200 h-40 rounded-3xl"></div>
                            <div className="bg-slate-200 h-40 rounded-3xl"></div>
                        </div>
                    </div>
                )}
            
                {/* Dashboard State */}
                {appState === 'dashboard' && optimizationResult && (
                    <div className="space-y-4">
                        <button 
                            onClick={() => { 
                                setAppState(optimizationResult.isHistorical ? 'history' : 'input'); 
                                setOptimizationResult(null); 
                            }} 
                            className="px-5 py-2 text-sm font-bold bg-slate-100 border border-slate-200 rounded-xl shadow-sm text-slate-700 hover:bg-slate-200 hover:shadow transition-all"
                        >
                            &larr; {optimizationResult.isHistorical ? 'Kembali ke Riwayat' : 'Pengadaan Baru'}
                        </button>
                        <OptimizationDashboard 
                            data={optimizationResult}
                            demoMode={health.demoMode}
                        />
                    </div>
                )}

                {/* Supplier Management */}
                {appState === 'suppliers' && (
                    <SupplierManagement />
                )}

                {/* Transaction History */}
                {appState === 'history' && (
                    <TransactionHistory onOpenDashboard={handleOpenHistoryDetail} />
                )}
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
