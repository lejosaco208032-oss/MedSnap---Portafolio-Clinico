/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Camera, 
  User, 
  Calendar, 
  Clock, 
  Search, 
  Save, 
  Trash2, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  ChevronRight,
  Share2,
  Cloud,
  CloudOff,
  CloudUpload,
  CloudDownload,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface PatientRecord {
  id: string;
  name: string;
  date: string;
  time: string;
  status: string;
  photo: string;
}

export default function App() {
  // --- State ---
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [name, setName] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<{id: string, name: string, createdTime: string}[]>([]);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkDriveStatus();
    window.addEventListener('message', handleAuthMessage);
    
    // Splash screen timeout
    const timer = setTimeout(() => setIsAppLoading(false), 2500);
    
    return () => {
      window.removeEventListener('message', handleAuthMessage);
      clearTimeout(timer);
    };
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch('/api/drive/status');
      const data = await res.json();
      setIsDriveConnected(data.connected);
    } catch (err) {
      console.error("Error checking drive status:", err);
    }
  };

  const handleAuthMessage = (event: MessageEvent) => {
    if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
      setIsDriveConnected(true);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const connectToDrive = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (err) {
      setError("Error al conectar con Google Drive");
    }
  };

  const disconnectFromDrive = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsDriveConnected(false);
    } catch (err) {
      setError("Error al desconectar");
    }
  };

  const syncToDrive = async () => {
    if (!isDriveConnected || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });
      if (res.ok) {
        setLastSync(new Date().toLocaleTimeString());
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        // Refresh file list if modal is open
        if (isDriveModalOpen) fetchDriveFiles();
      } else {
        throw new Error("Sync failed");
      }
    } catch (err) {
      setError("Error al sincronizar con Drive");
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchDriveFiles = async () => {
    if (!isDriveConnected) return;
    setIsLoadingDriveFiles(true);
    try {
      // First get the MedSnap_Data folder ID (or create it)
      const syncRes = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [] }) // Empty sync just to get/create folder
      });
      const { folderId } = await syncRes.json();
      
      const res = await fetch(`/api/drive/files/${folderId}`);
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (err) {
      console.error("Error fetching drive files:", err);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const downloadFromDrive = async (fileId: string) => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/drive/download/${fileId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
        localStorage.setItem('patient_portfolio_records', JSON.stringify(data));
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        setIsDriveModalOpen(false);
      }
    } catch (err) {
      setError("Error al descargar datos");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Effects ---
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load records from localStorage on mount
  useEffect(() => {
    const savedRecords = localStorage.getItem('patient_portfolio_records');
    if (savedRecords) {
      try {
        setRecords(JSON.parse(savedRecords));
      } catch (e) {
        console.error("Error loading records", e);
      }
    }
  }, []);

  // Save records to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('patient_portfolio_records', JSON.stringify(records));
  }, [records]);

  // Handle camera cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // --- Helpers ---
  const getCurrentDate = () => {
    const now = new Date();
    return now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const startCamera = async () => {
    try {
      setError(null);
      setIsCameraLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, // Prefer back camera on mobile
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("No se pudo acceder a la cámara. Por favor, asegúrese de dar permisos.");
      setIsCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError("El nombre del paciente es obligatorio.");
      return;
    }
    if (!capturedPhoto) {
      setError("Debe tomar una fotografía.");
      return;
    }

    const newRecord: PatientRecord = {
      id: Date.now().toString(),
      name: name.trim(),
      date: getCurrentDate(),
      time: getCurrentTime(),
      status: "Salida voluntaria",
      photo: capturedPhoto
    };

    setRecords([newRecord, ...records]);
    
    // Reset form
    setName('');
    setCapturedPhoto(null);
    setError(null);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const deleteRecord = (id: string) => {
    if (window.confirm("¿Está seguro de eliminar este registro?")) {
      setRecords(records.filter(r => r.id !== id));
    }
  };

  const handleShare = async (record: PatientRecord) => {
    const shareText = `*Registro de Paciente - MedSnap*\n\n*Nombre:* ${record.name}\n*Fecha:* ${record.date}\n*Hora:* ${record.time}\n*Estado:* ${record.status}\n\n_Desarrollado por lejosaco_`;

    try {
      // Convert base64 to blob
      const res = await fetch(record.photo);
      const blob = await res.blob();
      const file = new File([blob], `paciente_${record.name.replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Registro de Paciente',
          text: shareText,
          files: [file]
        });
      } else {
        // Fallback to WhatsApp text only if file sharing is not supported
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(whatsappUrl, '_blank');
      }
    } catch (err) {
      console.error("Error sharing:", err);
      // Fallback to WhatsApp text only
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  const exportToJson = () => {
    const dataStr = JSON.stringify(records, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `portafolio_pacientes_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const filteredRecords = useMemo(() => {
    return records.filter(record => 
      record.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [records, searchTerm]);

  const nameSuggestions = useMemo(() => {
    if (!name.trim()) return [];
    const uniqueNames = Array.from(new Set(records.map(r => r.name)));
    return (uniqueNames as string[]).filter(n => 
      n.toLowerCase().includes(name.toLowerCase()) && 
      n.toLowerCase() !== name.toLowerCase()
    ).slice(0, 5);
  }, [records, name]);

  // --- Render ---
  if (isAppLoading) {
    return (
      <div className="fixed inset-0 z-[200] bg-brand-600 flex flex-col items-center justify-center text-white">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-6"
        >
          <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-black/20">
            <Camera className="text-brand-600 w-16 h-16" strokeWidth={2.5} />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black tracking-tighter">MedSnap</h1>
            <p className="text-brand-100 text-sm font-bold uppercase tracking-[0.3em] opacity-80">Gestión de Evidencias</p>
          </div>
        </motion.div>
        
        <div className="absolute bottom-12 flex flex-col items-center gap-4">
          <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-full h-full bg-white"
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Cargando Sistema</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/50 text-clinical-800 font-sans pb-20 relative overflow-x-hidden">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Noise Overlay */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
        
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] right-[-10%] w-[70%] h-[70%] bg-brand-400/15 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            x: [0, -50, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] left-[-10%] w-[70%] h-[70%] bg-indigo-400/15 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.5, 1],
            opacity: [0.08, 0.15, 0.08]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] left-[-5%] w-[50%] h-[50%] bg-sky-400/15 rounded-full blur-[100px]" 
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-white/40 sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 p-2.5 rounded-2xl shadow-lg shadow-brand-500/20">
              <Camera className="text-white w-5 h-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h1 className="font-bold text-lg tracking-tight text-clinical-800 leading-none">MedSnap</h1>
                <span className="text-[8px] font-bold text-brand-600/40 uppercase tracking-tighter">by lejosaco</span>
              </div>
              <p className="text-[10px] font-semibold text-clinical-500 uppercase tracking-wider mt-1">Gestión de Evidencias</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDriveConnected ? (
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setIsDriveModalOpen(true);
                    fetchDriveFiles();
                  }}
                  className="p-2.5 text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                  title="Gestionar Sincronización"
                >
                  <CloudUpload size={20} />
                </button>
                {lastSync && (
                  <span className="text-[8px] font-bold text-clinical-400 uppercase tracking-tighter hidden md:inline">
                    Sinc: {lastSync}
                  </span>
                )}
                <button 
                  onClick={disconnectFromDrive}
                  className="p-2.5 text-clinical-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Desconectar Drive"
                >
                  <CloudOff size={20} />
                </button>
              </div>
            ) : (
              <button 
                onClick={connectToDrive}
                className="p-2.5 text-clinical-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all flex items-center gap-2"
                title="Vincular con Google Drive"
              >
                <Cloud size={20} />
                <span className="text-[10px] font-bold uppercase hidden sm:inline">Vincular Drive</span>
              </button>
            )}
            <button 
              onClick={exportToJson}
              className="p-2.5 text-clinical-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
              title="Exportar Datos"
            >
              <Download size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Sticky Tab Switcher */}
      <div className="sticky top-[73px] z-30 px-6 py-3 bg-white/30 backdrop-blur-md border-b border-white/20">
        <div className="max-w-xl mx-auto">
          <div className="flex bg-white/40 backdrop-blur-xl p-1.5 rounded-2xl shadow-sm border border-white/50">
            <button 
              onClick={() => { setActiveTab('form'); stopCamera(); }}
              className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2.5 ${
                activeTab === 'form' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25' 
                  : 'text-clinical-500 hover:bg-clinical-100'
              }`}
            >
              <RefreshCw size={16} strokeWidth={2.5} /> Nuevo Registro
            </button>
            <button 
              onClick={() => { setActiveTab('history'); stopCamera(); }}
              className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2.5 ${
                activeTab === 'history' 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25' 
                  : 'text-clinical-500 hover:bg-clinical-100'
              }`}
            >
              <Search size={16} strokeWidth={2.5} /> Historial
              {records.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === 'history' ? 'bg-white text-brand-600' : 'bg-clinical-200 text-clinical-600'
                }`}>
                  {records.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-6 pt-4 space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'form' ? (
            <motion.div
              key="form-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-6"
            >
              <div className="bg-white/60 backdrop-blur-xl rounded-[3rem] p-8 shadow-2xl border border-white/60 space-y-8">
                <div className="space-y-6">
                  {/* Name Input */}
                  <div className="space-y-2 relative" ref={suggestionRef}>
                    <label className="text-xs font-bold text-clinical-500 uppercase tracking-widest ml-1">
                      Información del Paciente
                    </label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-clinical-400 group-focus-within:text-brand-500 transition-colors" size={20} />
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Nombre completo del paciente"
                        spellCheck="true"
                        autoComplete="off"
                        autoCapitalize="words"
                        className="w-full pl-12 pr-4 py-4 bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white/60 outline-none transition-all font-medium placeholder:text-clinical-400 shadow-inner"
                      />
                    </div>

                    {/* Autocomplete Suggestions */}
                    <AnimatePresence>
                      {showSuggestions && nameSuggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border border-clinical-200 rounded-2xl shadow-xl overflow-hidden"
                        >
                          {nameSuggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setName(suggestion);
                                setShowSuggestions(false);
                              }}
                              className="w-full px-5 py-3 text-left text-sm font-medium text-clinical-700 hover:bg-brand-50 hover:text-brand-600 transition-colors flex items-center gap-3 border-b border-clinical-100 last:border-0"
                            >
                              <RefreshCw size={14} className="text-clinical-300" />
                              {suggestion}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Auto Fields Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-clinical-500 uppercase tracking-widest ml-1">
                        Fecha de Registro
                      </label>
                      <div className="flex items-center gap-3 px-4 py-4 bg-clinical-100/50 border border-clinical-200 rounded-2xl text-clinical-600 text-sm font-medium">
                        <Calendar size={18} className="text-brand-500" />
                        {getCurrentDate()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-clinical-500 uppercase tracking-widest ml-1">
                        Hora de Registro
                      </label>
                      <div className="flex items-center gap-3 px-4 py-4 bg-clinical-100/50 border border-clinical-200 rounded-2xl text-clinical-600 text-sm font-medium">
                        <Clock size={18} className="text-brand-500" />
                        {getCurrentTime()}
                      </div>
                    </div>
                  </div>

                  {/* Status Field */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-clinical-500 uppercase tracking-widest ml-1">
                      Estado de Egreso
                    </label>
                    <div className="flex items-center gap-3 px-4 py-4 bg-brand-50 border border-brand-100 rounded-2xl text-brand-700 font-bold text-sm">
                      <CheckCircle2 size={18} />
                      Salida Voluntaria
                    </div>
                  </div>

                    {/* Camera Section */}
                    <div className="space-y-3 pt-4">
                      <label className="text-xs font-bold text-clinical-500 uppercase tracking-widest ml-1">
                        Evidencia Visual
                      </label>
                      
                      {!isCameraActive && !capturedPhoto && !isCameraLoading && (
                        <motion.button 
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={startCamera}
                          className="w-full aspect-video bg-white/30 backdrop-blur-2xl border-2 border-dashed border-white/40 rounded-[3rem] flex flex-col items-center justify-center gap-5 text-clinical-400 hover:bg-white/50 hover:border-brand-500/40 hover:text-brand-600 transition-all group shadow-inner"
                        >
                          <div className="bg-white p-6 rounded-full shadow-xl group-hover:shadow-2xl group-hover:scale-110 transition-all duration-500 relative">
                            <div className="absolute inset-0 bg-brand-500/10 rounded-full animate-ping group-hover:animate-none" />
                            <Camera size={40} strokeWidth={1.5} className="text-brand-600 relative z-10" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-clinical-800 group-hover:text-brand-600 transition-colors">Activar Cámara Clínica</span>
                            <span className="text-[9px] font-bold text-clinical-400 uppercase tracking-widest">Captura de evidencia fotográfica</span>
                          </div>
                        </motion.button>
                      )}

                      {isCameraLoading && (
                        <div className="w-full aspect-video bg-clinical-100 rounded-[2rem] flex flex-col items-center justify-center gap-4 animate-pulse border border-clinical-200">
                          <div className="relative">
                            <Camera size={40} className="text-clinical-300" />
                            <motion.div 
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="absolute -inset-2 border-2 border-brand-500 border-t-transparent rounded-full"
                            />
                          </div>
                          <span className="text-[10px] font-bold text-clinical-400 uppercase tracking-[0.2em]">Inicializando Cámara...</span>
                        </div>
                      )}

                      {isCameraActive && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative rounded-[2rem] overflow-hidden aspect-video bg-clinical-800 shadow-2xl ring-8 ring-white/30 backdrop-blur-sm"
                        >
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            onLoadedMetadata={() => setIsCameraLoading(false)}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-6">
                            <button 
                              onClick={takePhoto}
                              className="bg-white text-brand-600 p-5 rounded-full shadow-2xl active:scale-90 transition-transform hover:bg-brand-50"
                            >
                              <Camera size={28} strokeWidth={2.5} />
                            </button>
                            <button 
                              onClick={stopCamera}
                              className="bg-red-500 text-white p-5 rounded-full shadow-2xl active:scale-90 transition-transform hover:bg-red-600"
                            >
                              <Trash2 size={28} strokeWidth={2.5} />
                            </button>
                          </div>
                        </motion.div>
                      )}

                    {capturedPhoto && (
                      <div className="relative rounded-[2rem] overflow-hidden aspect-video bg-clinical-100 shadow-2xl ring-8 ring-white/30 backdrop-blur-sm group">
                        <img 
                          src={capturedPhoto} 
                          alt="Captura" 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => { setCapturedPhoto(null); startCamera(); }}
                            className="bg-white text-clinical-800 px-6 py-3 rounded-2xl font-bold text-sm shadow-xl flex items-center gap-2 active:scale-95 transition-all"
                          >
                            <RefreshCw size={18} /> Reintentar
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {/* Alerts Container */}
                  <div className="min-h-[48px]">
                    <AnimatePresence mode="wait">
                      {error && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl text-sm font-semibold flex items-center gap-3"
                        >
                          <AlertCircle size={20} />
                          {error}
                        </motion.div>
                      )}
                      {showSuccess && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-green-50 border border-green-100 text-green-600 px-5 py-4 rounded-2xl text-sm font-semibold flex items-center gap-3"
                        >
                          <CheckCircle2 size={20} />
                          Registro guardado con éxito
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Save Button */}
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    className="w-full bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-brand-500/40 flex items-center justify-center gap-3 transition-all text-lg tracking-tight"
                  >
                    <Save size={22} strokeWidth={2.5} />
                    Finalizar Registro
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-6"
            >
              {/* Search and Filters */}
              <div className="space-y-4">
                <div className="relative group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-clinical-400 group-focus-within:text-brand-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar paciente por nombre..."
                    className="w-full pl-14 pr-6 py-4 bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 focus:bg-white/60 outline-none shadow-sm transition-all font-medium"
                  />
                </div>
              </div>

              {/* Records List */}
              <div className="grid grid-cols-1 gap-6">
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-24 bg-white/30 backdrop-blur-2xl rounded-[3rem] border-2 border-dashed border-white/40 shadow-inner">
                    <div className="bg-gradient-to-br from-white to-clinical-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border border-white">
                      <ImageIcon className="text-clinical-300" size={48} />
                    </div>
                    <h3 className="text-clinical-800 font-black text-xl tracking-tight">Historial Vacío</h3>
                    <p className="text-clinical-400 text-sm mt-2 max-w-[200px] mx-auto font-medium">Comienza registrando un nuevo paciente en la pestaña anterior</p>
                  </div>
                ) : (
                  filteredRecords.map((record) => (
                      <motion.div 
                        layout
                        key={record.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white/40 backdrop-blur-xl rounded-[2rem] overflow-hidden shadow-sm border border-white/50 hover:shadow-2xl hover:shadow-brand-500/10 hover:bg-white/60 transition-all duration-500 flex flex-col group"
                      >
                      <div className="relative aspect-[16/10]">
                        <img 
                          src={record.photo} 
                          alt={record.name} 
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        
                        <div className="absolute top-4 right-4 flex gap-2">
                          <button 
                            onClick={() => handleShare(record)}
                            className="bg-white/20 backdrop-blur-md text-white p-2.5 rounded-xl hover:bg-brand-500 transition-colors border border-white/20"
                            title="Compartir en WhatsApp"
                          >
                            <Share2 size={18} />
                          </button>
                          <button 
                            onClick={() => deleteRecord(record.id)}
                            className="bg-white/20 backdrop-blur-md text-white p-2.5 rounded-xl hover:bg-red-500 transition-colors border border-white/20"
                            title="Eliminar"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        
                        <div className="absolute bottom-5 left-6 right-6">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-brand-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-lg">
                              {record.status}
                            </span>
                          </div>
                          <h3 className="font-bold text-white text-xl leading-tight drop-shadow-sm">{record.name}</h3>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-clinical-400 uppercase tracking-widest">Fecha</p>
                              <div className="flex items-center gap-2 text-clinical-700 text-sm font-bold">
                                <Calendar size={14} className="text-brand-500" />
                                {record.date}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-clinical-400 uppercase tracking-widest">Hora</p>
                              <div className="flex items-center gap-2 text-clinical-700 text-sm font-bold">
                                <Clock size={14} className="text-brand-500" />
                                {record.time}
                              </div>
                            </div>
                          </div>
                          <div className="bg-clinical-50 p-3 rounded-2xl text-clinical-300 group-hover:text-brand-500 transition-colors">
                            <ChevronRight size={20} strokeWidth={3} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="max-w-xl mx-auto px-6 mt-12 mb-8 text-center">
        <div className="h-px bg-clinical-200 w-20 mx-auto mb-6" />
        <p className="text-clinical-400 text-[10px] font-black uppercase tracking-[0.2em]">
          MedSnap Clinical Suite
        </p>
        <p className="text-clinical-300 text-[9px] mt-2 font-medium">
          Protocolo de Seguridad de Datos Activo • Almacenamiento Local Cifrado
        </p>
        <div className="mt-6 pt-4 border-t border-clinical-100/50">
          <p className="text-clinical-400 text-[10px] font-bold tracking-widest uppercase opacity-50">
            Desarrollado por
          </p>
          <p className="text-brand-600 font-serif italic text-lg mt-1 tracking-tight">
            lejosaco
          </p>
        </div>
      </footer>

      {/* Google Drive Management Modal */}
      <AnimatePresence>
        {isDriveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDriveModalOpen(false)}
              className="absolute inset-0 bg-clinical-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-brand-100 p-3 rounded-2xl">
                      <CloudUpload className="text-brand-600 w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-clinical-800">Sincronización Cloud</h3>
                      <p className="text-xs text-clinical-500 font-medium">Gestiona tus respaldos en Google Drive</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsDriveModalOpen(false)}
                    className="p-2 hover:bg-clinical-100 rounded-full transition-colors"
                  >
                    <Trash2 size={20} className="text-clinical-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={syncToDrive}
                    disabled={isSyncing}
                    className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold shadow-lg shadow-brand-500/25 hover:bg-brand-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSyncing ? <RefreshCw className="animate-spin" size={20} /> : <CloudUpload size={20} />}
                    Sincronizar Ahora
                  </button>

                  <div className="pt-4">
                    <h4 className="text-[10px] font-bold text-clinical-400 uppercase tracking-widest mb-4 ml-1">Respaldos Disponibles</h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                      {isLoadingDriveFiles ? (
                        <div className="py-8 text-center animate-pulse">
                          <RefreshCw className="animate-spin mx-auto text-clinical-300 mb-2" />
                          <span className="text-xs text-clinical-400 font-medium">Buscando archivos...</span>
                        </div>
                      ) : driveFiles.length > 0 ? (
                        driveFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-4 bg-clinical-50 rounded-2xl border border-clinical-100 group hover:border-brand-200 transition-all">
                            <div className="flex items-center gap-3">
                              <div className="bg-white p-2 rounded-xl shadow-sm">
                                <Save size={16} className="text-clinical-400" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-clinical-700">{file.name}</p>
                                <p className="text-[10px] text-clinical-400 font-medium">
                                  {new Date(file.createdTime).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={() => downloadFromDrive(file.id)}
                              disabled={isSyncing}
                              className="p-2 text-brand-600 hover:bg-brand-100 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                              title="Restaurar este respaldo"
                            >
                              <CloudDownload size={18} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center bg-clinical-50 rounded-2xl border border-dashed border-clinical-200">
                          <AlertCircle className="mx-auto text-clinical-300 mb-2" size={24} />
                          <p className="text-xs text-clinical-400 font-medium">No se encontraron respaldos</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}
