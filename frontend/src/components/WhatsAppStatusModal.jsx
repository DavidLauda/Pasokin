import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import client from '../api/client';

export default function WhatsAppStatusModal({ isOpen, onClose, requirement, allocations, companyName, onDispatchComplete }) {
    const [waStatus, setWaStatus] = useState({ connectionState: 'disconnected', qr: null, isDemo: false });
    const [dispatchStatus, setDispatchStatus] = useState('idle'); // 'idle' | 'dispatching' | 'done'
    const [results, setResults] = useState([]);
    
    // Poll WA status
    useEffect(() => {
        if (!isOpen) return;

        const checkStatus = async () => {
            try {
                const res = await client.get('/wa/status');
                setWaStatus(res.data);
            } catch (err) {
                console.error("Gagal cek status WA", err);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, [isOpen]);

    // Trigger dispatch once connected
    useEffect(() => {
        if (!isOpen) return;
        if (waStatus.connectionState === 'connected' && dispatchStatus === 'idle') {
            setDispatchStatus('dispatching');
            
            client.post('/dispatch-wa', {
                allocations,
                requirement,
                companyName: companyName || "Pasokin Agent"
            })
            .then(res => {
                setResults(res.data.results || []);
                setDispatchStatus('done');
                if (onDispatchComplete) onDispatchComplete();
            })
            .catch(err => {
                console.error(err);
                setDispatchStatus('done');
            });
        }
    }, [isOpen, waStatus.connectionState, dispatchStatus, allocations, requirement, companyName, onDispatchComplete]);

    if (!isOpen) return null;

    const successfulCount = results.filter(r => r.status === 'sent').length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
                <div className="bg-slate-900 px-6 py-4">
                    <h2 className="text-lg font-semibold text-white">Status Dispatch WhatsApp</h2>
                </div>
                
                <div className="p-6">
                    {waStatus.connectionState !== 'connected' ? (
                        <div className="flex flex-col items-center justify-center space-y-4 py-8">
                            {waStatus.qr ? (
                                <>
                                    <p className="text-slate-700 font-medium text-center">Scan QR ini menggunakan WhatsApp di perangkat pengadaan Anda.</p>
                                    <div className="bg-white p-2 border border-slate-200 rounded-xl shadow-sm flex items-center justify-center">
                                        <img src={waStatus.qr} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500 mt-4">
                                        <Loader2 className="animate-spin h-4 w-4" />
                                        <span className="text-sm">Menunggu pemindaian...</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                                    <p className="text-slate-500">Menghubungkan ke server WhatsApp...</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                                <CheckCircle className="h-5 w-5" />
                                <span className="font-medium text-sm">WhatsApp Terhubung {waStatus.isDemo ? "(DEMO MODE)" : ""}</span>
                            </div>
                            
                            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                    <h3 className="text-sm font-semibold text-slate-700">Progres Pengiriman RFQ</h3>
                                </div>
                                <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                                    {dispatchStatus === 'dispatching' && results.length === 0 ? (
                                        <li className="px-4 py-8 text-center text-slate-500 flex flex-col items-center gap-3">
                                            <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                                            <span className="text-sm">Sedang memproses antrean pesan...</span>
                                        </li>
                                    ) : results.length > 0 ? (
                                        results.map((r, i) => (
                                            <li key={i} className="px-4 py-3 flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="font-medium text-slate-800 text-sm">{r.name}</p>
                                                    <p className="text-xs text-slate-500">{r.phone}</p>
                                                    {r.status === 'failed' && r.error && (
                                                        <p className="text-xs text-red-500 mt-1 bg-red-50 p-1 rounded border border-red-100 inline-block">{r.error}</p>
                                                    )}
                                                </div>
                                                <div className="flex-shrink-0 mt-1">
                                                    {r.status === 'sent' ? (
                                                        <CheckCircle className="h-5 w-5 text-green-500" />
                                                    ) : r.status === 'failed' ? (
                                                        <XCircle className="h-5 w-5 text-red-500" />
                                                    ) : (
                                                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                                                    )}
                                                </div>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="px-4 py-6 text-center text-slate-500 text-sm">
                                            Menyiapkan pengiriman...
                                        </li>
                                    )}
                                </ul>
                            </div>
                            
                            {dispatchStatus === 'done' && (
                                <div className="pt-2 pb-2 text-center text-sm font-semibold text-slate-700 bg-slate-50 rounded-lg py-3 border border-slate-200">
                                    {successfulCount} dari {allocations.length} RFQ berhasil dikirim.
                                </div>
                            )}
                            
                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={onClose}
                                    disabled={dispatchStatus === 'dispatching'}
                                    className="px-6 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
