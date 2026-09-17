// Utilities for converting Gemini TTS audio output into standard browser playable WAV Blobs
// and managing audio playback with fallback options.

export function pcmToWavBlob(
  pcmData: Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1
): Blob {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  // Helper to write ASCII characters
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF identifier
  writeString(0, 'RIFF');
  // RIFF chunk length (36 + data size)
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, byteRate, true);
  // block align
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  // Write PCM audio samples into the buffer
  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmData, 44);

  return new Blob([wavBytes], { type: 'audio/wav' });
}

export function base64ToAudioBlob(base64: string, mimeType: string = 'audio/pcm;rate=24000'): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Check if it already has a RIFF/WAVE or MP3 header
  const isRiff =
    len >= 12 &&
    binaryString.charCodeAt(0) === 0x52 && // 'R'
    binaryString.charCodeAt(1) === 0x49 && // 'I'
    binaryString.charCodeAt(2) === 0x46 && // 'F'
    binaryString.charCodeAt(3) === 0x46; // 'F'

  if (isRiff || mimeType.includes('wav') || mimeType.includes('mp3') || mimeType.includes('mpeg')) {
    return new Blob([bytes], { type: mimeType.split(';')[0] || 'audio/wav' });
  }

  // Extract sample rate from mimeType if present (e.g., audio/pcm;rate=24000)
  let rate = 24000;
  const rateMatch = mimeType.match(/rate=(\d+)/);
  if (rateMatch) {
    rate = parseInt(rateMatch[1], 10);
  }

  return pcmToWavBlob(bytes, rate, 1);
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function speakFallback(
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): { stop: () => void } {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    options?.onError?.(new Error('Browser speech synthesis not supported'));
    return { stop: () => {} };
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate || 1.0;
  utterance.pitch = options?.pitch || 1.0;
  if (options?.onEnd) {
    utterance.onend = () => options.onEnd?.();
  }
  if (options?.onError) {
    utterance.onerror = (e) => options.onError?.(e);
  }

  // Select an expressive English voice if available
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Google')));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);

  return {
    stop: () => window.speechSynthesis.cancel(),
  };
}
