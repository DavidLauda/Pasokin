import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Bot, Cpu } from 'lucide-react';
import RequirementForm from './components/RequirementForm';
import OptimizationDashboard from './components/OptimizationDashboard';
import WhatsAppStatusModal from './components/WhatsAppStatusModal';
import SupplierRepliesPanel from './components/SupplierRepliesPanel';
import SupplierManagement from './components/SupplierManagement';
import client from './api/client';

function App() {
  const [appState, setAppState] = useState('form'); // 'form' | 'dashboard' | 'loading_dashboard' | 'replies'
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [health, setHealth] = useState({ status: 'unknown', demoMode: false });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [finalAllocations, setFinalAllocations] = useState([]);

  useEffect(() => {
    client.get('/health').then(res => setHealth(res.data)).catch(() => {});
  }, []);

  const handleOptimizationResult = (data) => {
    setOptimizationResult(data);
    setAppState('dashboard');
  };

  const handleShortfall = (data) => {
    setOptimizationResult(data);
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

  const handleApprove = (allocations) => {
    setFinalAllocations(allocations);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setAppState('replies');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-amber-200">
      <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: '1rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', color: '#1e293b', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)' } }} />

      {/* Abstract Glow Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-60 z-0">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-amber-200 blur-[120px]"></div>
          <div className="absolute top-[40%] right-[10%] w-[40%] h-[50%] rounded-full bg-slate-300 blur-[120px]"></div>
      </div>

      {/* LEFT SIDEBAR (Solid White) */}
      <aside className="relative z-10 w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col hidden md:flex shadow-sm">
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
            <div className="bg-amber-400 p-2 rounded-xl shadow-sm mr-3">
                <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Pasokin</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1 rounded">Beta</span>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            <div className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Menu Utama</div>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('form');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState !== 'suppliers' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState !== 'suppliers' ? 'bg-amber-500' : 'bg-transparent'}`}></div>
                Pengadaan Aktif
            </a>
            <a href="#" onClick={(e) => {e.preventDefault(); setAppState('suppliers');}} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold ${appState === 'suppliers' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <div className={`w-1.5 h-4 rounded-full ${appState === 'suppliers' ? 'bg-amber-500' : 'bg-transparent'}`}></div>
                Manajemen Supplier
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-all">
                <div className="w-1.5 h-4 bg-transparent rounded-full"></div>
                Riwayat Transaksi
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-all">
                <div className="w-1.5 h-4 bg-transparent rounded-full"></div>
                Laporan & Analitik
            </a>
        </div>

        {/* What's New Box */}
        <div className="p-4 mb-4 mx-4 rounded-2xl bg-slate-50 border border-slate-200">
            <h4 className="text-slate-800 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Cpu className="h-3 w-3 text-amber-500"/> Pembaruan AI</h4>
            <p className="text-slate-500 text-xs leading-relaxed">Model negosiasi v2.1 sekarang aktif. Evaluasi harga 30% lebih akurat.</p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <header className="h-20 flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-extrabold text-slate-900">
                    {appState === 'form' ? 'Dashboard Kebutuhan' : 
                     appState === 'replies' ? 'Inbox Supplier' : 
                     appState === 'suppliers' ? 'Manajemen Supplier' : 'Hasil Optimasi AI'}
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

        {/* Scrollable Workspace */}
        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-[1600px] mx-auto space-y-8">
                
                {/* Announcement Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-400 p-2 rounded-full"><Bot className="h-4 w-4 text-slate-900"/></div>
                        <span className="text-sm font-bold text-slate-800">Sistem AI Pasokin siap memproses pengadaan Anda hari ini.</span>
                    </div>
                    <button className="text-xs font-bold bg-white border border-amber-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">Tutup</button>
                </div>

                {/* Main Dashboard Grid */}
                <div className={appState === 'form' || appState === 'loading_dashboard' ? 'block' : 'hidden'}>
                  <div className={appState === 'loading_dashboard' ? 'hidden' : 'grid grid-cols-1 xl:grid-cols-12 gap-8'}>
                      
                      {/* Left Column (Narrow - Quick Stats / Setup) */}
                      <div className="xl:col-span-3 space-y-4">
                          <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
                              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4">Statistik Global</h3>
                              
                              <div className="space-y-4">
                                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Target Terpenuhi</p>
                                      <p className="text-2xl font-extrabold text-slate-800">12<span className="text-sm text-slate-400">/15</span></p>
                                  </div>
                                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Rata-Rata Hemat</p>
                                      <p className="text-2xl font-extrabold text-slate-800">14.5%</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Supplier Aktif</p>
                                      <p className="text-2xl font-extrabold text-slate-800">249</p>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Center Column (Wide - Requirement Form) */}
                      <div className="xl:col-span-6">
                          <RequirementForm 
                            onResult={handleOptimizationResult} 
                            onLoadingStart={() => setAppState('loading_dashboard')}
                            onError={() => setAppState('form')}
                          />
                      </div>
                      
                      {/* Right Column (Narrow - Activity) */}
                      <div className="xl:col-span-3 space-y-6">
                          <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 h-full">
                              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                  Aktivitas Terbaru
                              </h3>
                              
                              <div className="relative pl-4 border-l-2 border-slate-100 space-y-6">
                                  <div className="relative">
                                      <div className="absolute -left-[21px] top-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white shadow-sm"></div>
                                      <p className="text-xs text-slate-400 font-bold mb-0.5">2 mnt lalu</p>
                                      <p className="text-sm text-slate-700 font-medium">AI menegosiasikan harga <span className="font-bold text-slate-900">Besi Beton</span> dengan 3 supplier</p>
                                  </div>
                                  <div className="relative">
                                      <div className="absolute -left-[21px] top-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm"></div>
                                      <p className="text-xs text-slate-400 font-bold mb-0.5">15 mnt lalu</p>
                                      <p className="text-sm text-slate-700 font-medium">PO otomatis diterbitkan ke <span className="font-bold text-slate-900">PT Sinar Baja</span></p>
                                  </div>
                                  <div className="relative">
                                      <div className="absolute -left-[21px] top-1 w-3 h-3 bg-slate-300 rounded-full border-2 border-white shadow-sm"></div>
                                      <p className="text-xs text-slate-400 font-bold mb-0.5">1 jam lalu</p>
                                      <p className="text-sm text-slate-700 font-medium">Pengadaan <span className="font-bold text-slate-900">Kabel NYY</span> selesai disetujui</p>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                
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
                </div>
        
        {appState === 'dashboard' && optimizationResult && (
          <OptimizationDashboard 
            data={optimizationResult} 
            onApprove={handleApprove} 
          />
        )}

        {appState === 'replies' && (
          <div className="space-y-6 pb-20">
             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Inbox Respons Supplier</h1>
                <button 
                  onClick={() => { setAppState('form'); setOptimizationResult(null); }} 
                  className="px-5 py-2 text-sm font-bold bg-slate-100 border border-slate-200 rounded-xl shadow-sm text-slate-700 hover:bg-slate-200 hover:shadow transition-all"
                >
                    &larr; Kembali ke Dashboard
                </button>
             </div>
             <SupplierRepliesPanel 
                allocations={finalAllocations} 
                demoMode={health.demoMode} 
                onShortfall={handleShortfall}
             />
          </div>
        )}

        {appState === 'suppliers' && (
          <SupplierManagement />
        )}
            </div>
        </div>
      </main>

      <WhatsAppStatusModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        allocations={finalAllocations}
        requirement={optimizationResult?.requirement}
        companyName="PT Pasokin Demo"
      />
    </div>
  );
}

export default App;
