import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, MoreHorizontal, Download, Plus, X, Sparkles, Volume2, Info, Maximize2, Trash2, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { MoodboardItem, ActiveImageState, VoiceIntentResult } from './types';
import { MoodboardCard } from './components/MoodboardCard';
import { ActiveFrame } from './components/ActiveFrame';
import { EventVoicePlayer } from './components/EventVoicePlayer';

// Organic Layout Engine: ensures space utilization across full screen, dynamic resizing for dense collections,
// and strict exclusion zones (top header bar, bottom center Spoken Text/Mic safe area, and middle hero image)
function computeOrganicLayout(
  items: MoodboardItem[],
  mode: 'sidebar' | 'scatter',
  scatterZoom: number = 1.0,
  panOffset: { x: number; y: number } = { x: 0, y: 0 },
  hasCenterContent: boolean = false
): MoodboardItem[] {
  const n = items.length;
  if (n === 0) return [];

  const ww = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const wh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Approximate card dimensions
  const cardW = Math.min(280, ww * 0.28);
  const cardH = cardW * 1.1; 

  // Helper to safely clamp coordinates
  const applySafeBounds = (x_pct: number, y_pct: number, scale: number, centerActive: boolean) => {
    // 1.15 multiplier accounts for white photo border, decorative tape, drop shadow, and rotated card corners
    const hw_pct = (((cardW * scale) / 2) * 1.15 / ww) * 100;
    const hh_pct = (((cardH * scale) / 2) * 1.15 / wh) * 100;

    // Keep card fully on-screen
    const edgeBuffer = 1.0;
    const minX = hw_pct + edgeBuffer;
    const maxX = 100 - hw_pct - edgeBuffer;
    let clampedX = Math.max(minX, Math.min(maxX, x_pct));

    // Top: keep below header
    const minY = hh_pct + 11;

    // Bottom center transcript/mic safe zone
    const transcriptHalfW_pct = (300 / ww) * 100;
    const isNearCenter = Math.abs(clampedX - 50) < (transcriptHalfW_pct + hw_pct);

    const bottomSafeHeight_pct = (190 / wh) * 100;
    let maxY = isNearCenter ? 100 - bottomSafeHeight_pct - hh_pct : 100 - hh_pct - 2;

    // Strict Center Hero & Spoken Text exclusion zone!
    // When center content is active, no image may ever overlap the center photo frame or text box underneath
    if (centerActive) {
      const centerExclusionHalfW_pct = Math.min(18, (190 / ww) * 100);
      if (clampedX <= 50) {
        clampedX = Math.min(clampedX, 50 - centerExclusionHalfW_pct - hw_pct);
      } else {
        clampedX = Math.max(clampedX, 50 + centerExclusionHalfW_pct + hw_pct);
      }
    }

    const clampedY = Math.max(minY, Math.min(maxY, y_pct));
    return { x: clampedX, y: clampedY };
  };

  if (mode === 'sidebar') {
    const leftItems = items.filter((_, idx) => idx % 2 === 0);
    const rightItems = items.filter((_, idx) => idx % 2 === 1);
    const leftCount = leftItems.length;
    const rightCount = rightItems.length;
    const maxSideCount = Math.max(leftCount, rightCount);

    // Keep cards generous! Cards can overlap with each other, just NOT with center hero or text!
    let baseScale = 0.95;
    if (maxSideCount >= 4) baseScale = 0.88;
    if (maxSideCount >= 7) baseScale = 0.82;
    if (maxSideCount >= 10) baseScale = 0.76;

    const hw_safe = (((cardW * baseScale) / 2) * 1.15 / ww) * 100;
    const hh_pct = (((cardH * baseScale) / 2) * 1.15 / wh) * 100;

    // Center exclusion zone half-width
    const centerExclusionHalfW_pct = Math.min(18, (190 / ww) * 100);

    // Card CENTER ranges: perfectly symmetrical about x = 50%
    const leftMin = hw_safe + 1.0;
    const leftMax = Math.max(leftMin + 5, 50 - centerExclusionHalfW_pct - hw_safe);
    const rightMin = Math.min(100 - hw_safe - 6.0, 50 + centerExclusionHalfW_pct + hw_safe);
    const rightMax = 100 - hw_safe - 1.0;

    return items.map((item, idx) => {
      const isLeft = idx % 2 === 0;
      const sideIndex = Math.floor(idx / 2);
      const count = isLeft ? leftCount : rightCount;

      const cMin = isLeft ? leftMin : rightMin;
      const cMax = isLeft ? leftMax : rightMax;
      const regionW = cMax - cMin;

      // 1 column for ≤3 items per side, 2 columns for 4+
      const cols = count <= 3 ? 1 : 2;
      const rows = Math.ceil(count / cols);
      const col = cols === 1 ? 0 : sideIndex % cols;
      const row = cols === 1 ? sideIndex : Math.floor(sideIndex / cols);

      // --- X: position columns ---
      let x: number;
      if (cols === 1) {
        // Single column: placed comfortably in the center of the side region
        x = cMin + regionW * 0.45;
      } else {
        if (isLeft) {
          // Left side: col 0 is outer column near left screen edge, col 1 is inner column near hero safe boundary
          x = col === 0 ? cMin : cMax;
        } else {
          // Right side: col 0 is inner column near hero safe boundary, col 1 is outer column near right screen edge
          x = col === 0 ? cMin : cMax;
        }
      }

      // --- Y: distribute rows evenly with top and bottom margins ---
      const topY = hh_pct + 13;
      const bottomY = 100 - hh_pct - 2;
      const yRange = bottomY - topY;

      let y: number;
      if (rows === 1) {
        y = 52;
      } else {
        y = topY + row * (yRange / (rows - 1));
      }

      // Organic jitter for natural scatter feel
      const jitterX = (((idx * 13) % 10) / 10 - 0.5) * 1.2;
      const jitterY = (((idx * 17) % 10) / 10 - 0.5) * 2.5;
      x += jitterX;
      y += jitterY;

      // Ensure x stays strictly in side bounds before final clamping
      x = Math.max(cMin, Math.min(cMax, x));

      const rot = ((idx * 31) % 12) - 6;
      const { x: safeX, y: safeY } = applySafeBounds(x, y, baseScale, hasCenterContent);

      return {
        ...item,
        x: safeX,
        y: safeY,
        scale: baseScale,
        rotation: item.rotation || rot,
        zIndex: item.zIndex || idx + 1,
      };
    });
  } else {
    // Scatter mode (no center image)
    let baseScale = 1.0;
    if (n >= 4) baseScale = 0.9;
    if (n >= 8) baseScale = 0.8;
    if (n >= 12) baseScale = 0.7;

    const effectiveScale = baseScale * scatterZoom;

    return items.map((item, idx) => {
      let x = 50;
      let y = 50;

      if (n === 1) {
        x = 50;
        y = 45;
      } else if (n === 2) {
        x = idx === 0 ? 25 : 75;
        y = 45;
      } else {
        const cols = Math.ceil(Math.sqrt(n * 1.5));
        const rows = Math.ceil(n / cols);
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        const hw_pct = (((cardW * effectiveScale) / 2) * 1.28 / ww) * 100;
        const hh_pct = (((cardH * effectiveScale) / 2) * 1.28 / wh) * 100;
        
        const startX = hw_pct + 2;
        const endX = 100 - hw_pct - 2;
        const xSpacing = cols > 1 ? (endX - startX) / (cols - 1) : 0;
        
        const startY = hh_pct + 13;
        const endY = 100 - hh_pct - 4; // Avoid transcript at bottom
        const ySpacing = rows > 1 ? (endY - startY) / (rows - 1) : 0;

        x = cols === 1 ? 50 : startX + col * xSpacing;
        y = rows === 1 ? 52 : startY + row * ySpacing;

        const pseudoRandX = ((idx * 13) % 10) / 10 - 0.5;
        const pseudoRandY = ((idx * 17) % 10) / 10 - 0.5;
        x += pseudoRandX * 4;
        y += pseudoRandY * 4;
      }

      const finalX = 50 + (x - 50) * scatterZoom + panOffset.x;
      const finalY = 50 + (y - 50) * scatterZoom + panOffset.y;

      const rot = ((idx * 37) % 15) - 7;
      const { x: safeX, y: safeY } = applySafeBounds(finalX, finalY, effectiveScale, hasCenterContent);

      return {
        ...item,
        x: safeX,
        y: safeY,
        scale: effectiveScale,
        rotation: item.rotation || rot,
      };
    });
  }
}

export default function App() {
  // Core Moodboard & Active State
  const [themeTitle, setThemeTitle] = useState<string | null>(null);
  const [boardItems, setBoardItems] = useState<MoodboardItem[]>([]);
  const [activeImage, setActiveImage] = useState<ActiveImageState>({
    imageUrl: null,
    prompt: null,
    status: 'idle',
    feedbackMessage: null,
  });

  // UI & Interaction States
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState<MoodboardItem | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Scatter & Explore Mode States
  const [isScatterView, setIsScatterView] = useState(false);
  const [scatterZoom, setScatterZoom] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isScatterViewRef = useRef(isScatterView);
  const scatterZoomRef = useRef(scatterZoom);
  const panOffsetRef = useRef(panOffset);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    isScatterViewRef.current = isScatterView;
  }, [isScatterView]);
  useEffect(() => {
    scatterZoomRef.current = scatterZoom;
  }, [scatterZoom]);
  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  // References for WebSocket & Speech processing
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const autoListenRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const activeImageRef = useRef<ActiveImageState>(activeImage);
  const themeTitleRef = useRef<string | null>(themeTitle);
  const boardItemsRef = useRef<MoodboardItem[]>(boardItems);

  useEffect(() => {
    activeImageRef.current = activeImage;
  }, [activeImage]);

  useEffect(() => {
    themeTitleRef.current = themeTitle;
  }, [themeTitle]);

  useEffect(() => {
    boardItemsRef.current = boardItems;
  }, [boardItems]);

  // Centralized check for whether center exclusion zone must be enforced
  const hasActiveCenter = Boolean(
    activeImage.imageUrl ||
    activeImage.status !== 'idle' ||
    selectedItemForModal ||
    transcript ||
    error
  );

  // Automatically switch between sidebar columns and scatter desk when center focus changes
  useEffect(() => {
    if (hasActiveCenter && isScatterView) {
      setIsScatterView(false);
      setBoardItems((prev) => computeOrganicLayout(prev, 'sidebar', 1.0, { x: 0, y: 0 }, true));
    } else if (!hasActiveCenter && !isScatterView && boardItemsRef.current.length > 0) {
      setIsScatterView(true);
      setBoardItems((prev) => computeOrganicLayout(prev, 'scatter', scatterZoomRef.current, panOffsetRef.current, false));
    } else {
      setBoardItems((prev) => computeOrganicLayout(prev, isScatterViewRef.current ? 'scatter' : 'sidebar', scatterZoomRef.current, panOffsetRef.current, hasActiveCenter));
    }
  }, [hasActiveCenter, isScatterView, activeImage.imageUrl, activeImage.status, selectedItemForModal, transcript, error]);

  const toggleScatterMode = useCallback(() => {
    const nextMode = !isScatterView;
    setIsScatterView(nextMode);
    if (!nextMode) {
      setScatterZoom(1.0);
      setPanOffset({ x: 0, y: 0 });
    }
    const currentHasCenter = Boolean(
      activeImageRef.current.imageUrl ||
      activeImageRef.current.status !== 'idle' ||
      selectedItemForModal ||
      transcript ||
      error
    );
    setBoardItems((prev) => computeOrganicLayout(prev, nextMode ? 'scatter' : 'sidebar', nextMode ? scatterZoomRef.current : 1.0, nextMode ? panOffsetRef.current : { x: 0, y: 0 }, currentHasCenter));
  }, [isScatterView, selectedItemForModal, transcript, error]);

  const handleBoardWheel = useCallback((e: React.WheelEvent) => {
    if (selectedItemForModal || activeImage.status === 'generating' || activeImage.status === 'editing') return;
    if (boardItemsRef.current.length === 0) return;

    if (!isScatterViewRef.current) {
      setIsScatterView(true);
    }

    const delta = e.deltaY;
    setScatterZoom((prev) => {
      const nextZoom = Math.max(0.6, Math.min(2.8, prev + delta * 0.0015));
      setBoardItems((items) => computeOrganicLayout(items, 'scatter', nextZoom, panOffsetRef.current, hasActiveCenter));
      return nextZoom;
    });
  }, [selectedItemForModal, activeImage.status, hasActiveCenter]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.photo-print') || (e.target as HTMLElement).closest('button')) return;
    if (boardItemsRef.current.length === 0) return;

    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffsetRef.current.x,
      panY: panOffsetRef.current.y,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
  }, []);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    const dx = ((e.clientX - panStartRef.current.x) / window.innerWidth) * 100;
    const dy = ((e.clientY - panStartRef.current.y) / window.innerHeight) * 100;
    
    const newPan = {
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    };
    setPanOffset(newPan);
    setBoardItems((items) => computeOrganicLayout(items, isScatterViewRef.current ? 'scatter' : 'sidebar', scatterZoomRef.current, newPan, hasActiveCenter));
  }, [hasActiveCenter]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  }, []);

  // Bring a board item to top layer
  const handleBringToFront = useCallback((id: string) => {
    setMaxZIndex((prev) => {
      const nextZ = prev + 1;
      setBoardItems((items) =>
        items.map((item) => (item.id === id ? { ...item, zIndex: nextZ } : item))
      );
      return nextZ;
    });
  }, []);

  // Update item coordinates on board drag
  const handleUpdatePosition = useCallback((id: string, x: number, y: number) => {
    setBoardItems((items) =>
      items.map((item) => (item.id === id ? { ...item, x, y } : item))
    );
  }, []);

  // Delete item from board
  const handleDeleteItem = useCallback((id: string) => {
    setBoardItems((items) => items.filter((item) => item.id !== id));
    if (selectedItemForModal?.id === id) {
      setSelectedItemForModal(null);
    }
  }, [selectedItemForModal]);

  // Save current active image to board
  const saveActiveToBoard = useCallback((currentActive: ActiveImageState) => {
    if (!currentActive.imageUrl) return;

    const count = boardItemsRef.current.length;
    const tapeStyles: ('top-center' | 'corners' | 'pin')[] = ['top-center', 'corners', 'pin'];
    const randomTape = tapeStyles[count % tapeStyles.length];
    const randomRot = Math.round((Math.random() - 0.5) * 10); // -5 to +5 deg

    const newItem: MoodboardItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      imageUrl: currentActive.imageUrl,
      prompt: currentActive.prompt || "Editorial concept",
      x: 14,
      y: 22,
      rotation: randomRot,
      scale: 1,
      zIndex: maxZIndex + 1,
      tapeStyle: randomTape,
    };

    setMaxZIndex((prev) => prev + 1);
    setBoardItems((prev) => {
      const allItems = [...prev, newItem];
      return computeOrganicLayout(allItems, isScatterViewRef.current ? 'scatter' : 'sidebar', scatterZoomRef.current, panOffsetRef.current, true);
    });
  }, [maxZIndex]);

  // Handle voice commands via AI router
  const handleVoiceCommand = useCallback(async (spokenText: string) => {
    if (!spokenText.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setError(null);
    const currentActive = activeImageRef.current;
    const currentTheme = themeTitleRef.current;

    setActiveImage((prev) => ({
      ...prev,
      status: prev.imageUrl ? 'editing' : 'analyzing',
      feedbackMessage: null,
    }));

    const targetImageToEdit = currentActive.imageUrl || selectedItemForModal?.imageUrl || null;
    const targetPromptToEdit = currentActive.prompt || selectedItemForModal?.prompt || null;

    try {
      console.log(`%c[Nano Banana Flash Lite] [parse-intent] Analyzing transcript: "${spokenText}" (hasActiveImage: ${Boolean(targetImageToEdit)} | activePrompt: "${targetPromptToEdit || 'none'}")`, 'color: #ff9900; font-weight: bold; background: #111; padding: 4px 8px; border-radius: 4px;');

      // Step 1: Parse intent with super fast reasoning LLM
      const intentRes = await fetch('/api/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: spokenText,
          currentTheme,
          hasActiveImage: Boolean(targetImageToEdit),
          activeImagePrompt: targetPromptToEdit,
          boardSummary: boardItemsRef.current.map((i) => i.prompt).slice(-6).join(', '),
        }),
      });

      if (!intentRes.ok) throw new Error("Failed to parse speech intent");
      const intent: VoiceIntentResult = await intentRes.json();

      console.log(`%c[Nano Banana Flash Lite] [parse-intent] Action result: ${intent.action} | Prompt: "${intent.imagePrompt}"`, 'color: #ffcc00; font-weight: bold; background: #111; padding: 4px 8px; border-radius: 4px;');

      // Update theme title if new theme was declared
      if (intent.themeTitle && intent.themeTitle !== currentTheme) {
        setThemeTitle(intent.themeTitle);
      }

      // Step 2: Execute Action
      if (intent.action === 'IGNORE') {
        setActiveImage((prev) => ({ ...prev, status: prev.imageUrl ? 'ready' : 'idle', feedbackMessage: null }));
        setTimeout(() => setTranscript(''), 1500);
        isProcessingRef.current = false;
        return;
      }

      if (intent.action === 'DISCARD_ACTIVE') {
        setActiveImage({ imageUrl: null, prompt: null, status: 'idle', feedbackMessage: null });
        setTimeout(() => setTranscript(''), 1000);
        // If user also requested a new prompt while discarding
        if (intent.imagePrompt) {
          await generateNewImage(intent.imagePrompt, intent.themeTitle || currentTheme);
        }
        isProcessingRef.current = false;
        return;
      }

      if (intent.action === 'SAVE_AND_NEXT') {
        // Save current active image to board layout!
        if (currentActive.imageUrl) {
          saveActiveToBoard(currentActive);
        }

        // Generate next image
        if (intent.imagePrompt) {
          setActiveImage({
            imageUrl: null,
            prompt: intent.imagePrompt,
            status: 'generating',
            feedbackMessage: null,
          });
          await generateNewImage(intent.imagePrompt, intent.themeTitle || currentTheme);
        } else {
          setActiveImage({ imageUrl: null, prompt: null, status: 'idle', feedbackMessage: null });
        }
        setTimeout(() => setTranscript(''), 1200);
        isProcessingRef.current = false;
        return;
      }

      if (intent.action === 'START_NEW_THEME') {
        if (intent.imagePrompt) {
          setActiveImage({
            imageUrl: null,
            prompt: intent.imagePrompt,
            status: 'generating',
            feedbackMessage: null,
          });
          await generateNewImage(intent.imagePrompt, intent.themeTitle || currentTheme);
        } else {
          setActiveImage((prev) => ({ ...prev, status: 'idle', feedbackMessage: null }));
        }
        setTimeout(() => setTranscript(''), 1200);
        isProcessingRef.current = false;
        return;
      }

      if (intent.action === 'EDIT_ACTIVE') {
        if (!targetImageToEdit) {
          // If no image is active in center or modal, treat as new generation
          if (intent.imagePrompt) {
            await generateNewImage(intent.imagePrompt, intent.themeTitle || currentTheme);
          }
        } else if (intent.imagePrompt) {
          console.log(`%c[Nano Banana Flash Lite] [edit-image] Sending previous image + instruction to Gemini: "${intent.imagePrompt}"`, 'color: #00ffcc; font-weight: bold; background: #111; padding: 4px 8px; border-radius: 4px;');
          setActiveImage((prev) => ({
            ...prev,
            imageUrl: prev.imageUrl || targetImageToEdit,
            status: 'editing',
            prompt: `${prev.prompt || targetPromptToEdit || 'Image'} (modified: ${intent.imagePrompt})`,
            feedbackMessage: null,
          }));

          const editRes = await fetch('/api/edit-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              image: targetImageToEdit, 
              prompt: intent.imagePrompt,
              previousPrompt: targetPromptToEdit
            }),
          });

          if (!editRes.ok) throw new Error("Failed to edit image");
          const editData = await editRes.json();
          setActiveImage({
            imageUrl: editData.imageUrl,
            prompt: targetPromptToEdit ? `${targetPromptToEdit} (edited: ${intent.imagePrompt})` : intent.imagePrompt,
            status: 'ready',
            feedbackMessage: null,
          });
          if (selectedItemForModal) {
            setSelectedItemForModal(null);
          }
        }
        setTimeout(() => setTranscript(''), 1200);
        isProcessingRef.current = false;
        return;
      }
    } catch (err: any) {
      console.error("Voice processing error:", err);
      setError(`Notice: ${err.message || 'Failed to process command'}`);
      setActiveImage((prev) => ({ ...prev, status: prev.imageUrl ? 'ready' : 'idle', feedbackMessage: null }));
    } finally {
      isProcessingRef.current = false;
    }
  }, [saveActiveToBoard, selectedItemForModal]);

  // Helper: Generate brand new image
  const generateNewImage = async (prompt: string, theme: string | null) => {
    try {
      console.log(`%c[Nano Banana Flash Lite] [generate-image] Sending prompt to Gemini: "${prompt}" (Theme: "${theme || 'none'}")`, 'color: #ffd700; font-weight: bold; background: #111; padding: 4px 8px; border-radius: 4px;');
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, theme }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Generation failed");
      }

      const data = await res.json();
      setActiveImage({
        imageUrl: data.imageUrl,
        prompt: prompt,
        status: 'ready',
        feedbackMessage: null,
      });
    } catch (err: any) {
      console.error("Generation error:", err);
      setError(`Image error: ${err.message}`);
      setActiveImage((prev) => ({ ...prev, status: 'idle', feedbackMessage: null }));
    }
  };

  const handleGenerateEventVisual = useCallback(async (prompt: string, theme: string) => {
    setThemeTitle(theme);
    setActiveImage({
      imageUrl: null,
      prompt: prompt,
      status: 'generating',
      feedbackMessage: 'Creating visual for Traffic Episode 02...',
    });
    await generateNewImage(prompt, theme);
  }, []);

  // Start microphone and WebSocket connection
  const startListening = useCallback(() => {
    // Clean up existing
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    let silenceTimer: any = null;
    let accumulatedText = '';
    let committedText = '';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/transcribe`);
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (ws?.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          ws.send(JSON.stringify({ type: 'audio', audio: base64, mimeType: 'audio/pcm;rate=16000' }));
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        setIsListening(true);
        setError(null);
      } catch (err: any) {
        setError(`Microphone access needed: ${err.message}`);
        setIsListening(false);
        autoListenRef.current = false;
        ws.close();
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'gemini_response' && data.serverContent) {
          const content = data.serverContent;
          let newText = '';

          const finalTrans = content.inputTranscription || content.input_transcription;
          if (finalTrans) {
            newText = finalTrans.text || finalTrans;
          } else {
            const interimTrans = content.interimInputTranscription || content.interim_input_transcription;
            if (interimTrans) {
              newText = interimTrans.text || interimTrans;
            } else if (content.modelTurn?.parts) {
              newText = content.modelTurn.parts.map((p: any) => p.text || '').join('');
            }
          }

          if (newText && newText.trim()) {
            accumulatedText = newText;
            const fullText = (committedText ? committedText + ' ' : '') + accumulatedText;
            setTranscript(fullText);

            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              const textToSend = (committedText ? committedText + ' ' : '') + accumulatedText;
              if (textToSend.trim() && !isProcessingRef.current) {
                handleVoiceCommand(textToSend.trim());
                committedText = '';
                accumulatedText = '';
              }
            }, 1500);
          }

          if (content.turnComplete) {
            if (accumulatedText.trim()) {
              committedText = (committedText ? committedText + ' ' : '') + accumulatedText;
              accumulatedText = '';
            }
          }
        } else if (data.type === 'error') {
          console.error("Gemini Live Error:", data.error);
        }
      } catch (err) {
        console.error("Error reading WS message:", err);
      }
    };

    ws.onclose = () => {
      setIsListening(false);
      if (autoListenRef.current && !isProcessingRef.current) {
        setTimeout(() => startListening(), 1000);
      }
    };
  }, [handleVoiceCommand]);

  // Toggle microphone Mute / Unmute
  const toggleListening = () => {
    if (autoListenRef.current) {
      // Mute
      autoListenRef.current = false;
      setIsListening(false);
      clearTimeout(silenceTimeoutRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch (e) {}
      }
    } else {
      // Unmute
      autoListenRef.current = true;
      startListening();
      // Calculate and lock in correct image distribution upon unmuting
      setBoardItems((prev) => computeOrganicLayout(prev, isScatterViewRef.current ? 'scatter' : 'sidebar', scatterZoomRef.current, panOffsetRef.current));
    }
  };

  // Download all moodboard images as ZIP
  const handleDownloadAll = async () => {
    setIsMenuOpen(false);
    if (boardItems.length === 0 && !activeImage.imageUrl) {
      setError("No images on the board yet to download.");
      return;
    }

    try {
      const zip = new JSZip();
      const folderName = themeTitle ? themeTitle.replace(/[^a-zA-Z0-9]/g, '_') : 'Reverie_Moodboard';
      const folder = zip.folder(folderName);

      // Include active center image if present
      const allToZip = [...boardItems];
      if (activeImage.imageUrl) {
        allToZip.unshift({
          id: 'active',
          imageUrl: activeImage.imageUrl,
          prompt: activeImage.prompt || 'Active Concept',
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          zIndex: 0,
        });
      }

      allToZip.forEach((item, idx) => {
        const b64 = item.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const cleanPrompt = item.prompt.slice(0, 25).replace(/[^a-zA-Z0-9]/g, '_') || `image_${idx + 1}`;
        folder?.file(`${idx + 1}_${cleanPrompt}.png`, b64, { base64: true });
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("ZIP Error:", err);
      setError("Failed to generate ZIP archive.");
    }
  };

  // Create new board (Reset)
  const handleCreateNewBoard = () => {
    setIsMenuOpen(false);
    setBoardItems([]);
    setActiveImage({ imageUrl: null, prompt: null, status: 'idle', feedbackMessage: null });
    setThemeTitle(null);
    setTranscript('');
    setSelectedItemForModal(null);
    setError(null);
    if (autoListenRef.current) {
      autoListenRef.current = false;
      setIsListening(false);
      clearTimeout(silenceTimeoutRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch (e) {}
      }
    }
  };

  const showFrontPage = boardItems.length === 0 && !activeImage.imageUrl && activeImage.status === 'idle' && !autoListenRef.current && !transcript.trim();

  return (
    <div className="h-screen w-full relative overflow-hidden font-sans select-none bg-[#120e0c]">
      {/* Wall Background Layer */}
      <div 
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none transition-opacity duration-1000 scale-102 ${showFrontPage ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundImage: 'url("/front_bg.jpg")' }}
      />
      <div 
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none transition-opacity duration-1000 scale-102 ${showFrontPage ? 'opacity-0' : 'opacity-100'}`}
        style={{ backgroundImage: 'url("/main_bg.jpg")' }}
      />
      {/* 22% Opacity #4e3b28 Layer */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${showFrontPage ? 'opacity-0' : 'opacity-22'}`} style={{ backgroundColor: '#4e3b28' }} />

      {/* --- TOP HEADER & CONTROLS --- */}
      <AnimatePresence>
        {showFrontPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="absolute inset-0 z-30 pointer-events-none"
          >
            {/* Top-Left Metadata Labels */}
            <div className="absolute top-6 left-3 sm:left-5 flex flex-col gap-[0.3rem]">
              <span className="font-outfit text-[clamp(0.8rem,1vw,0.95rem)] font-normal tracking-[0.12em] uppercase leading-[1.5] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                Voice-first
              </span>
              <span className="font-outfit text-[clamp(0.8rem,1vw,0.95rem)] font-normal tracking-[0.12em] uppercase leading-[1.5] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                Moodboard tool
              </span>
            </div>

            {/* Hero Title (reverie) */}
            <div className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 flex items-center">
              <h1 className="font-outfit text-[clamp(5rem,15vw,14rem)] font-bold tracking-[-0.03em] leading-[0.9] lowercase text-white drop-shadow-[0_2px_40px_rgba(0,0,0,0.3),_0_1px_6px_rgba(0,0,0,0.2)]">
                reverie
              </h1>
            </div>

            {/* Mic Button Pill & Text Label (Bottom-Left) */}
            <div className="absolute bottom-10 left-3 sm:left-5 pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                onClick={toggleListening}
                className="flex items-center gap-3 rounded-[50px] border border-white bg-transparent backdrop-blur-[12px] px-[1.5rem] py-[0.75rem] pl-[1.1rem] hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <Mic className="w-[22px] h-[22px] stroke-[1.8] text-white opacity-85 group-hover:scale-110 transition-transform" />
                <span className="font-outfit text-[clamp(0.8rem,1vw,0.95rem)] font-normal tracking-[0.1em] uppercase text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
                  Unmute to begin
                </span>
              </button>

              <button
                onClick={() => setShowVoiceModal(true)}
                className="flex items-center gap-2.5 rounded-[50px] border border-amber-300/70 bg-black/40 backdrop-blur-[12px] px-[1.4rem] py-[0.75rem] hover:bg-white/10 hover:border-white transition-all cursor-pointer group shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
              >
                <Volume2 className="w-[20px] h-[20px] text-amber-300 group-hover:scale-110 transition-transform" />
                <span className="font-outfit text-[clamp(0.78rem,0.95vw,0.92rem)] font-medium tracking-[0.1em] uppercase text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
                  Event Voice • Traffic Ep. 02
                </span>
              </button>
            </div>

            {/* Description Text (Bottom-Right) */}
            <div className="absolute bottom-10 right-6 sm:right-10 max-w-[430px] text-right">
              <p className="font-garamond text-[clamp(1.25rem,2vw,1.65rem)] font-normal italic leading-[1.4] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                Start by naming your theme and aesthetic. Ask for images one by one, request tweaks to perfect your vision, and simply say “next” to watch your visual story unfold.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!showFrontPage && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-6 left-3 sm:left-5 z-40 h-10 flex items-center"
          >
            <h1 className="font-outfit text-[clamp(1.8rem,3.2vw,2.6rem)] font-bold tracking-[-0.035em] lowercase text-white leading-none">
              reverie
            </h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Center: Moodboard Title (Only shown when themeTitle is generated) */}
      <AnimatePresence>
        {!showFrontPage && themeTitle && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-40 px-4 max-w-[70vw] text-center h-10 flex items-center justify-center"
          >
            <h2 className="font-outfit text-[clamp(1.05rem,1.5vw,1.4rem)] font-normal tracking-[0.12em] uppercase text-white truncate leading-none">
              {themeTitle}
            </h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar Quick Access: Open Help Button & Event Voice Button */}
      <div className="fixed top-6 right-16 sm:right-20 z-40 h-10 flex items-center gap-2">
        <button
          id="open-help-button"
          onClick={() => setShowHelpModal(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/30 bg-black/40 backdrop-blur-[12px] px-3.5 py-1.5 hover:bg-black/60 hover:border-white/70 transition-all text-xs font-medium text-white shadow-lg cursor-pointer group"
          title="Open Help & Voice Commands Tutorial"
        >
          <HelpCircle className="w-3.5 h-3.5 text-white/90 group-hover:scale-110 transition-transform" />
          <span className="font-outfit uppercase tracking-wider text-[11px] font-semibold text-white/90">Open Help</span>
        </button>

        <button
          id="open-event-voice-button"
          onClick={() => setShowVoiceModal(true)}
          className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-black/40 backdrop-blur-[12px] px-3.5 py-1.5 hover:bg-black/60 hover:border-amber-400/80 transition-all text-xs font-medium text-white shadow-lg cursor-pointer group"
          title="Open Event Voice Announcement"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-300 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline font-outfit uppercase tracking-wider text-[11px] font-semibold text-white/90">Event Voice</span>
          <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-amber-400/30">Traffic 02</span>
        </button>
      </div>

      {/* Top Right: Menu Button & Dropdown */}
      <div className="fixed top-6 right-6 sm:right-10 z-50 h-10 flex items-center justify-end">
        <div className="relative">
          {showFrontPage ? (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex gap-[5px] p-2 transition-opacity opacity-100"
              title="Menu"
            >
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
            </button>
          ) : (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex gap-[5px] p-2 transition-opacity opacity-100"
              title="Board Options"
            >
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
              <span className="w-[4.5px] h-[4.5px] bg-white rounded-full"></span>
            </button>
          )}

          <AnimatePresence>
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-3 w-56 bg-black/30 backdrop-blur-[16px] border border-white rounded-2xl shadow-2xl py-1.5 z-50 overflow-hidden text-white font-sans"
                >
                  <button
                    id="menu-open-help-button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setShowHelpModal(true);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-normal hover:font-bold text-white cursor-pointer transition-all"
                  >
                    <HelpCircle className="w-4 h-4 text-white stroke-[1.8]" />
                    <span>Open Help &amp; Tutorial</span>
                  </button>
                  <div className="h-[1px] bg-white/20 my-1 mx-2" />
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setShowVoiceModal(true);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-normal hover:font-bold text-white cursor-pointer transition-all"
                  >
                    <Volume2 className="w-4 h-4 text-amber-300 stroke-[1.8]" />
                    <span>Event Voice: Traffic Ep. 02</span>
                  </button>
                  <div className="h-[1px] bg-white/20 my-1 mx-2" />
                  <button
                    onClick={handleDownloadAll}
                    disabled={boardItems.length === 0 && !activeImage.imageUrl}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-normal hover:font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <Download className="w-4 h-4 text-white stroke-[1.8]" />
                    <span>Download all as images</span>
                  </button>
                  <div className="h-[1px] bg-white/20 my-1 mx-2" />
                  <button
                    onClick={handleCreateNewBoard}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-3 text-sm font-normal hover:font-bold text-white cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4 text-white stroke-[1.8]" />
                    <span>Create new board</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* --- MOODBOARD CANVAS AREA --- */}
      <main
        onWheel={handleBoardWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        className="w-full h-full relative z-10 overflow-hidden font-display"
        style={{ fontFamily: "'Bodoni Moda', serif" }}
      >
        {boardItems.map((item) => (
          <MoodboardCard
            key={item.id}
            item={item}
            onBringToFront={handleBringToFront}
            onUpdatePosition={handleUpdatePosition}
            onDelete={handleDeleteItem}
            onSelect={(selected) => setSelectedItemForModal(selected)}
            hasCenterContent={hasActiveCenter}
          />
        ))}
      </main>

      {/* --- ACTIVE CENTER IMAGE FRAME --- */}
      <ActiveFrame
        activeImage={activeImage}
        onDiscard={() => setActiveImage({ imageUrl: null, prompt: null, status: 'idle', feedbackMessage: null })}
        onSelect={(item) => setSelectedItemForModal(item as MoodboardItem)}
        transcript={transcript}
        error={error}
      />

      {/* --- BOTTOM FLOATING CONTROLS & TRANSCRIPT --- */}

      {/* --- UNIFIED SPOKEN TEXT & ERROR SAFE AREA (BOTTOM CENTER) --- */}
      <div className="fixed bottom-[130px] left-1/2 -translate-x-1/2 z-40 w-full max-w-[600px] px-6 pointer-events-none flex flex-col items-center justify-center gap-2">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error-message"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-300 px-4 text-xs sm:text-sm font-sans pointer-events-none text-center drop-shadow-md"
            >
              {error}
            </motion.div>
          )}

          {!showFrontPage && transcript && (
            <motion.div
              key="transcript-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              ref={transcriptScrollRef}
              className="w-full text-center max-h-[160px] overflow-hidden pointer-events-auto transition-all duration-300 flex flex-col justify-end"
              style={{ scrollBehavior: 'smooth' }}
            >
              <p className="font-outfit text-[clamp(0.95rem,1.4vw,1.1rem)] font-normal leading-[1.4] tracking-[0.01em] text-white inline-block">
                "{transcript}"<span className="inline-block w-[2px] h-[1em] bg-[#F5F0E8] ml-1 align-middle animate-blink"></span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Center: Icon-Only Mute / Unmute Button */}
      <AnimatePresence>
        {!showFrontPage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center"
          >
            <button
              onClick={toggleListening}
              className="p-3 transition-all duration-300 focus:outline-none group cursor-pointer"
              title={autoListenRef.current ? "Mute Microphone" : "Unmute Microphone"}
            >
              {autoListenRef.current ? (
                <Mic className="w-7 h-7 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.22)] group-hover:scale-110 transition-transform duration-200" />
              ) : (
                <MicOff className="w-7 h-7 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.22)] group-hover:scale-110 transition-all duration-200" />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HIGH-RES ENLARGE MODAL --- */}
      <AnimatePresence>
        {selectedItemForModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedItemForModal(null)}
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[18px] flex items-center justify-center p-4 sm:p-6 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 15, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="h-[80vh] max-h-[80vh] aspect-square max-w-[min(80vh,92vw)] w-auto relative flex flex-col cursor-default"
            >
              {/* Decorative White Tape Piece */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-32 h-8 tape-piece z-30 -rotate-1 rounded-xs pointer-events-none" />

              {/* Photo print container hovering elevated over blurred canvas */}
              <div className="photo-print rounded-xs p-3.5 sm:p-4 shadow-[0_25px_60px_rgba(0,0,0,0.55),_0_0_1px_rgba(255,255,255,0.2)] relative w-full h-full flex flex-col justify-between">
                {/* Close X button in top right */}
                <button
                  onClick={() => setSelectedItemForModal(null)}
                  className="absolute -top-3 -right-3 w-[28px] h-[28px] rounded-full bg-[rgba(245,240,232,0.95)] shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center justify-center hover:bg-[#F5F0E8] transition-colors z-30 cursor-pointer"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5 text-[#5A4E44] stroke-[2.2]" />
                </button>

                {/* Photo Display */}
                <div className="w-full flex-1 min-h-0 bg-[#120e0c] rounded-[2px] overflow-hidden relative">
                  <img
                    src={selectedItemForModal.imageUrl}
                    alt={selectedItemForModal.prompt}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Bottom Actions Bar */}
                <div className="mt-3 pt-1 flex items-center justify-end px-1">
                  <button
                    onClick={() => {
                      if (selectedItemForModal.id === 'active') {
                        setActiveImage({ imageUrl: null, prompt: null, status: 'idle', feedbackMessage: null });
                      } else {
                        handleDeleteItem(selectedItemForModal.id);
                      }
                      setSelectedItemForModal(null);
                    }}
                    className="w-8 h-8 rounded-full bg-[#E5E7EB] hover:bg-[#D1D5DB] text-[#4B5563] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                    title="Delete Image"
                  >
                    <Trash2 className="w-4 h-4 stroke-[2]" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HELP / HOW-TO MODAL --- */}
      <AnimatePresence>
        {showHelpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelpModal(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1a1412] border border-white/20 p-8 sm:p-10 rounded-3xl max-w-lg w-full text-white shadow-2xl relative"
            >
              <button
                onClick={() => setShowHelpModal(false)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              
              <h3 className="font-sans text-2xl sm:text-3xl mb-3 text-white font-medium tracking-tight">Welcome to Reverie</h3>
              <p className="font-sans text-base text-white/75 mb-6 leading-relaxed">
                Reverie uses live voice AI to seamlessly build tangible moodboards without clicking buttons or typing prompts.
              </p>

              <div className="space-y-3 font-sans text-sm text-white/90">
                <div className="bg-white/[0.05] p-4 rounded-2xl border border-white/10">
                  <h4 className="font-semibold text-white mb-1 text-sm">1. Announce Theme &amp; Subject</h4>
                  <p className="text-white/70 text-xs">"I want to create a wedding mood board. Let's first start by looking at flowers - generate a colourful bridal bouquet."</p>
                </div>
                <div className="bg-white/[0.05] p-4 rounded-2xl border border-white/10">
                  <h4 className="font-semibold text-white mb-1 text-sm">2. Edit by Speaking</h4>
                  <p className="text-white/70 text-xs">"Show me this with red hues, also add lilies."</p>
                </div>
                <div className="bg-white/[0.05] p-4 rounded-2xl border border-white/10">
                  <h4 className="font-semibold text-white mb-1 text-sm">3. Move On (Core Magic)</h4>
                  <p className="text-white/70 text-xs">Say <span className="text-white font-semibold">"next"</span> or <span className="text-white font-semibold">"let's move on"</span>. Reverie saves your current card onto the board and generates your next idea!</p>
                </div>
                <div className="bg-white/[0.05] p-4 rounded-2xl border border-white/10">
                  <h4 className="font-semibold text-white mb-1 text-sm">4. Organize &amp; Download</h4>
                  <p className="text-white/70 text-xs">Mute when finished speaking to drag photo prints around the studio desk, click to enlarge, or download everything as a ZIP!</p>
                </div>
              </div>

              <button
                onClick={() => setShowHelpModal(false)}
                className="mt-8 w-full py-3.5 rounded-full bg-white text-black font-sans text-base font-medium hover:bg-white/90 transition-all shadow-lg"
              >
                Start Creating
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- EVENT VOICE ANNOUNCEMENT MODAL --- */}
      <EventVoicePlayer
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onGenerateEventVisual={handleGenerateEventVisual}
      />
    </div>
  );
}
