export interface MoodboardItem {
  id: string;
  imageUrl: string;
  prompt: string;
  x: number; // Percentage (10 - 80)
  y: number; // Percentage (15 - 75)
  rotation: number; // Degrees (-8 to 8)
  scale: number;
  zIndex: number;
  tapeStyle?: 'top-center' | 'corners' | 'pin';
}

export interface ActiveImageState {
  imageUrl: string | null;
  prompt: string | null;
  status: 'idle' | 'analyzing' | 'generating' | 'editing' | 'ready';
  feedbackMessage: string | null;
}

export interface VoiceIntentResult {
  action: 'START_NEW_THEME' | 'EDIT_ACTIVE' | 'SAVE_AND_NEXT' | 'DISCARD_ACTIVE' | 'IGNORE';
  themeTitle: string | null;
  imagePrompt: string | null;
  feedbackMessage?: string;
}
