import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Download, 
  RotateCcw, 
  Sparkles, 
  Sliders, 
  Music, 
  Check, 
  X, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Radio
} from 'lucide-react';
import { base64ToAudioBlob, formatTime, speakFallback } from '../lib/audioUtils';

interface EventVoicePlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateEventVisual?: (prompt: string, theme: string) => void;
}

const DEFAULT_RAW_TEXT =
  'This event will be happenning on octomber 11 at parkstreet where house and this is Traffic Episode 02, do not miss this event , see you their ';

const POLISHED_TEXT =
  'This event will be happening on October 11 at Park Street Warehouse, and this is Traffic Episode 02. Do not miss this event, see you there!';

const VOICES = [
  { id: 'Kore', name: 'Kore', desc: 'Warm & Natural', gender: 'Female' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Deep & Punchy', gender: 'Male' },
  { id: 'Puck', name: 'Puck', desc: 'Upbeat & Hype', gender: 'Male' },
  { id: 'Charon', name: 'Charon', desc: 'Cinematic & Bold', gender: 'Male' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Smooth & Chill', gender: 'Female' },
];

const STYLES = [
  { id: 'hype', label: 'Warehouse Hype', desc: 'High-energy underground club promoter' },
  { id: 'announcement', label: 'Clear Announcement', desc: 'Crisp, official event broadcast' },
  { id: 'atmospheric', label: 'Underground Night', desc: 'Moody, late-night atmospheric tone' },
];

export const EventVoicePlayer: React.FC<EventVoicePlayerProps> = ({
  isOpen,
  onClose,
  onGenerateEventVisual,
}) => {
  const [text, setText] = useState<string>(DEFAULT_RAW_TEXT);
  const [activeTab, setActiveTab] = useState<'raw' | 'polished' | 'custom'>('raw');
  const [selectedVoice, setSelectedVoice] = useState<string>('Fenrir');
  const [selectedStyle, setSelectedStyle] = useState<string>('hype');
  
  // Audio state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackRef = useRef<{ stop: () => void } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [visualizerLevels, setVisualizerLevels] = useState<number[]>(new Array(24).fill(12));

  // Switch tabs
  const handleSelectTab = (tab: 'raw' | 'polished' | 'custom') => {
    setActiveTab(tab);
    if (tab === 'raw') {
      setText(DEFAULT_RAW_TEXT);
    } else if (tab === 'polished') {
      setText(POLISHED_TEXT);
    }
  };

  // Animate visualizer while playing
  useEffect(() => {
    if (!isPlaying) {
      setVisualizerLevels(new Array(24).fill(12));
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const updateWave = () => {
      setVisualizerLevels((prev) =>
        prev.map((_, i) => {
          const base = Math.sin(Date.now() * 0.007 + i * 0.4) * 0.5 + 0.5;
          const jitter = Math.random() * 0.3;
          return Math.max(14, Math.min(94, Math.round((base + jitter) * 85)));
        })
      );
      animFrameRef.current = requestAnimationFrame(updateWave);
    };

    animFrameRef.current = requestAnimationFrame(updateWave);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Audio element listeners
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration || 0);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = (e: any) => {
      console.error('Audio playback error', e);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Update speed & mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.muted = isMuted;
    }
  }, [playbackSpeed, isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (fallbackRef.current) {
        fallbackRef.current.stop();
      }
    };
  }, []);

  // Generate Voice via Gemini TTS
  const handleGenerateAndPlay = async (forceRegenerate: boolean = false) => {
    setErrorNotice(null);

    // If audio already exists and we are just toggling play/pause without changing settings
    if (audioUrl && !forceRegenerate && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (e: any) {
          console.warn('Direct audio play failed, regenerating:', e);
          handleGenerateAndPlay(true);
        }
      }
      return;
    }

    setIsLoading(true);
    setStatusMessage('Generating voice with Gemini 3.1 Flash TTS...');

    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (fallbackRef.current) {
        fallbackRef.current.stop();
      }

      const res = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice: selectedVoice,
          style: selectedStyle,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'TTS service temporarily unavailable');
      }

      const data = await res.json();
      const blob = base64ToAudioBlob(data.audio, data.mimeType);
      const url = URL.createObjectURL(blob);

      setAudioUrl(url);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.muted = isMuted;
        await audioRef.current.play();
        setIsPlaying(true);
      }

      setStatusMessage(null);
    } catch (err: any) {
      console.warn('Gemini TTS failed, falling back to Web Speech API:', err.message);
      setStatusMessage('Playing via high-quality browser voice fallback...');

      // Fallback to Web Speech API
      const fallback = speakFallback(text, {
        rate: playbackSpeed,
        pitch: selectedVoice === 'Fenrir' || selectedVoice === 'Charon' ? 0.85 : 1.05,
        onEnd: () => {
          setIsPlaying(false);
          setStatusMessage(null);
        },
        onError: (speechErr) => {
          setErrorNotice('Unable to play audio: ' + (speechErr.message || err.message));
          setIsPlaying(false);
          setStatusMessage(null);
        },
      });

      fallbackRef.current = fallback;
      setIsPlaying(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = parseFloat(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `Traffic_Episode_02_${selectedVoice}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCreateVisual = () => {
    if (onGenerateEventVisual) {
      onGenerateEventVisual(
        'Industrial warehouse techno music club event poster for Traffic Episode 02 at Park Street Warehouse, atmospheric haze, red and amber beam lighting, raw brick aesthetic, film grain',
        'Traffic Episode 02 - Warehouse Event'
      );
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[16px] flex items-center justify-center p-3 sm:p-6"
      >
        <motion.div
          initial={{ scale: 0.93, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.93, y: 15, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#15100e] border border-white/20 rounded-3xl w-full max-w-2xl text-white shadow-[0_30px_90px_rgba(0,0,0,0.8)] overflow-hidden relative flex flex-col max-h-[92vh]"
        >
          {/* Decorative subtle ambient backdrop glow */}
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shadow-inner">
                <Radio className="w-5 h-5 text-amber-300 stroke-[2] animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-outfit text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
                    Traffic Episode 02
                  </h3>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full tracking-wider">
                    Park Street Warehouse
                  </span>
                </div>
                <p className="font-sans text-xs text-white/60">
                  Text-to-Voice Event Promo &amp; Announcement
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer text-white/80 hover:text-white"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="px-6 py-5 overflow-y-auto space-y-5 relative z-10 font-sans">
            {/* Announcement Text Box with Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-white/60 font-medium">
                  Announcement Script
                </span>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
                  <button
                    onClick={() => handleSelectTab('raw')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'raw'
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Exact Text
                  </button>
                  <button
                    onClick={() => handleSelectTab('polished')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'polished'
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Polished Copy
                  </button>
                  <button
                    onClick={() => setActiveTab('custom')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      activeTab === 'custom'
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="relative group">
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setActiveTab('custom');
                  }}
                  rows={3}
                  className="w-full bg-black/40 border border-white/15 rounded-2xl p-3.5 text-sm sm:text-base text-white/90 placeholder-white/40 focus:outline-none focus:border-amber-400/80 transition-colors resize-none font-sans leading-relaxed shadow-inner"
                  placeholder="Type or paste the announcement text..."
                />
                <div className="text-[11px] text-white/40 text-right mt-1">
                  Event: Oct 11 • Park Street Warehouse • Traffic Ep. 02
                </div>
              </div>
            </div>

            {/* Voice & Style Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Voice Actor Selector */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-white/60 font-medium">
                  Voice Model
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`px-2 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedVoice === v.id
                          ? 'bg-white/20 border-white text-white font-medium shadow-sm'
                          : 'bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-semibold">{v.name}</div>
                      <div className="text-[10px] text-white/50 truncate">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style / Delivery Tone */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-white/60 font-medium">
                  Delivery Tone
                </label>
                <div className="space-y-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={`w-full px-3 py-1.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        selectedStyle === s.id
                          ? 'bg-white/20 border-white text-white'
                          : 'bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{s.label}</div>
                        <div className="text-[10px] text-white/50">{s.desc}</div>
                      </div>
                      {selectedStyle === s.id && <Check className="w-3.5 h-3.5 text-amber-300" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Visualizer & Audio Control Station */}
            <div className="bg-black/50 border border-white/15 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
              {/* Animated Soundwave Frequency Bars */}
              <div className="h-16 flex items-center justify-center gap-1 sm:gap-1.5 px-2 bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                {visualizerLevels.map((lvl, idx) => (
                  <motion.div
                    key={idx}
                    className="w-1.5 sm:w-2 bg-gradient-to-t from-amber-500 via-rose-400 to-amber-200 rounded-full"
                    style={{
                      height: `${lvl}%`,
                      opacity: isPlaying ? 0.95 : 0.25,
                      transition: isPlaying ? 'height 0.1s ease' : 'height 0.3s ease',
                    }}
                  />
                ))}
              </div>

              {/* Scrubber / Timeline Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-white/50 font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(audioDuration || (isPlaying ? 8 : 0))}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!audioUrl}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-amber-400 disabled:opacity-30 disabled:cursor-not-allowed"
                />
              </div>

              {/* Central Audio Playback Action Deck */}
              <div className="flex items-center justify-between pt-1">
                {/* Speed Controls */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
                  {[0.8, 1.0, 1.25].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-white/20 text-white font-bold'
                          : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {/* Primary Play / Pause Button */}
                <button
                  onClick={() => handleGenerateAndPlay(false)}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-amber-300 text-black font-semibold text-sm sm:text-base hover:scale-105 active:scale-95 transition-all shadow-[0_0_25px_rgba(251,191,36,0.4)] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Synthesizing Voice...</span>
                    </>
                  ) : isPlaying ? (
                    <>
                      <Pause className="w-5 h-5 fill-black" />
                      <span>Pause Announcement</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-black ml-0.5" />
                      <span>{audioUrl ? 'Play Voice Announcement' : 'Generate & Speak Voice'}</span>
                    </>
                  )}
                </button>

                {/* Auxiliary Controls (Mute & Download) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={handleDownload}
                    disabled={!audioUrl}
                    className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Download Audio (.wav)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Status and Error Alerts */}
              {statusMessage && (
                <div className="text-center text-xs text-amber-300/90 animate-pulse">
                  {statusMessage}
                </div>
              )}
              {errorNotice && (
                <div className="text-center text-xs text-red-400 bg-red-950/40 p-2 rounded-xl border border-red-800/40">
                  {errorNotice}
                </div>
              )}
            </div>
          </div>

          {/* Footer Action: Moodboard Visual Card Integration */}
          <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10 text-xs text-white/70">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Bring this event to life on your moodboard canvas</span>
            </span>

            {onGenerateEventVisual && (
              <button
                onClick={handleCreateVisual}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-all cursor-pointer border border-white/15"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Create Warehouse Event Visual Card</span>
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
