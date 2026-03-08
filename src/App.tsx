/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Mic, 
  MicOff, 
  Truck, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ExternalLink,
  History,
  Loader2,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getTowingProcedure } from './services/geminiService';
import { LiveAssistant } from './services/liveApiService';
import { AppMode } from './types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('search');
  const [vehicle, setVehicle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; sources: string[] } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const liveAssistantRef = useRef<LiveAssistant | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!vehicle.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await getTowingProcedure(vehicle);
      setResult(data);
      if (!history.includes(vehicle)) {
        setHistory(prev => [vehicle, ...prev].slice(0, 5));
      }
    } catch (err) {
      setError('Failed to fetch procedure. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleVoice = async () => {
    if (isListening) {
      liveAssistantRef.current?.disconnect();
      setIsListening(false);
      setMode('search');
    } else {
      setMode('voice');
      setIsListening(true);
      setVoiceTranscript('Connecting to Live Recovery Assistant...');
      
      const assistant = new LiveAssistant();
      liveAssistantRef.current = assistant;

      await assistant.connect({
        onMessage: (text) => setVoiceTranscript(text),
        onAudio: (base64) => {
          audioQueueRef.current.push(base64);
          playNextInQueue();
        },
        onInterrupted: () => {
          audioQueueRef.current = [];
          isPlayingRef.current = false;
        },
        onProcedureFound: (text) => {
          setResult({ text, sources: [] });
          setMode('search'); // Switch back to search mode to show the result
        },
        onError: (err) => {
          console.error("Live API Error:", err);
          setError("Voice connection lost.");
          setIsListening(false);
        }
      });
    }
  };

  const playNextInQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const base64 = audioQueueRef.current.shift()!;
    const audioData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const buffer = audioContext.createBuffer(1, audioData.length / 2, 24000);
    const channelData = buffer.getChannelData(0);
    
    const view = new DataView(audioData.buffer);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  };

  useEffect(() => {
    return () => {
      liveAssistantRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] px-6 py-4 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#141414] rounded-lg">
            <Truck className="text-[#E4E3E0] w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">TowCheck Pro</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Verified Recovery Protocol v2.5</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleVoice}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border border-[#141414] transition-all duration-300 ${isListening ? 'bg-[#141414] text-[#E4E3E0] animate-pulse' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="text-xs font-bold uppercase tracking-wider">{isListening ? 'Stop Voice' : 'Voice Assist'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white border border-[#141414] p-6 rounded-2xl shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h2 className="font-serif italic text-lg mb-4 flex items-center gap-2">
              <Search size={18} /> Vehicle Search
            </h2>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase opacity-50 block mb-1">Vehicle Details</label>
                <input 
                  type="text" 
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="e.g. 2024 Tesla Model 3 AWD"
                  className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 transition-all placeholder:opacity-30"
                />
              </div>
              <button 
                disabled={loading}
                className="w-full bg-[#141414] text-[#E4E3E0] py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                {loading ? 'Searching Documentation...' : 'Verify Procedure'}
              </button>
            </form>
          </section>

          {history.length > 0 && (
            <section className="bg-white/50 border border-[#141414] p-6 rounded-2xl">
              <h2 className="font-serif italic text-sm mb-4 flex items-center gap-2 opacity-60">
                <History size={14} /> Recent Checks
              </h2>
              <div className="space-y-2">
                {history.map((item, i) => (
                  <button 
                    key={i} 
                    onClick={() => { setVehicle(item); handleSearch(); }}
                    className="w-full text-left text-xs p-2 hover:bg-[#141414] hover:text-[#E4E3E0] rounded-lg transition-colors border border-transparent hover:border-[#141414]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="text-emerald-400" size={18} />
              <h3 className="text-xs font-bold uppercase tracking-widest">Safety Protocol</h3>
            </div>
            <p className="text-[11px] leading-relaxed opacity-70">
              All procedures are verified against official OEM documentation. Always verify the vehicle VIN and drivetrain configuration before initiating recovery.
            </p>
          </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {mode === 'voice' ? (
              <motion.div 
                key="voice"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-[#141414] text-[#E4E3E0] p-12 rounded-3xl min-h-[500px] flex flex-col items-center justify-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white rounded-full blur-[120px] animate-pulse" />
                </div>
                
                <div className="relative z-10 space-y-8 max-w-lg">
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                      <div className="relative bg-white text-[#141414] p-6 rounded-full">
                        <Mic size={48} />
                      </div>
                    </div>
                  </div>
                  <h2 className="text-2xl font-serif italic">Live Recovery Assistant</h2>
                  <p className="text-lg leading-relaxed font-light">
                    {voiceTranscript || "Listening for vehicle details..."}
                  </p>
                  <div className="flex justify-center gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="w-1 h-8 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                <div className="bg-white border border-[#141414] rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
                  <div className="bg-[#141414] text-[#E4E3E0] p-6 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-widest">Verified Procedure Found</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-mono">
                      <Info size={12} /> OEM DATA
                    </div>
                  </div>
                  
                  <div className="p-8 space-y-8">
                    <div className="markdown-body font-sans text-sm leading-relaxed text-[#141414]/80">
                      <ReactMarkdown>{result.text || "No procedure details returned."}</ReactMarkdown>
                    </div>

                    {result.sources.length > 0 && (
                      <div className="pt-6 border-t border-[#141414]/10">
                        <h4 className="text-[10px] font-mono uppercase opacity-50 mb-3 tracking-widest">Verification Sources</h4>
                        <div className="flex flex-wrap gap-3">
                          {result.sources.map((url, i) => (
                            <a 
                              key={i} 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-[10px] bg-[#E4E3E0] px-3 py-1.5 rounded-full hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                            >
                              <ExternalLink size={10} />
                              {new URL(url).hostname}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[#141414]/20 rounded-3xl">
                <div className="p-6 bg-white rounded-full mb-6 shadow-sm">
                  <Truck size={48} className="opacity-20" />
                </div>
                <h3 className="text-xl font-serif italic mb-2">Awaiting Vehicle Input</h3>
                <p className="text-sm opacity-50 max-w-xs">
                  Enter vehicle year, make, and model to retrieve verified towing procedures from official manufacturer documentation.
                </p>
              </div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-center gap-3 text-sm"
            >
              <AlertTriangle size={18} />
              {error}
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto p-6 mt-12 border-t border-[#141414]/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono uppercase opacity-40">
        <p>© 2026 TowCheck Pro Systems</p>
        <div className="flex gap-6">
          <span>Real-time Search Grounding Enabled</span>
          <span>Live API v2.5 Active</span>
          <span>OEM Verified Data Only</span>
        </div>
      </footer>
    </div>
  );
}
