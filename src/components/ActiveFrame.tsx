import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActiveImageState } from '../types';
import { X } from 'lucide-react';

interface ActiveFrameProps {
  activeImage: ActiveImageState;
  onDiscard: () => void;
  onSelect?: (item: { id: string; imageUrl: string; prompt: string }) => void;
  transcript?: string;
  error?: string | null;
}

export const ActiveFrame: React.FC<ActiveFrameProps> = ({ activeImage, onDiscard, onSelect, transcript, error }) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!activeImage.imageUrl && activeImage.status === 'idle') {
    return null;
  }

  const isBusy = activeImage.status === 'generating' || activeImage.status === 'editing' || activeImage.status === 'analyzing';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -20 }}
        transition={{ type: 'spring', stiffness: 220, damping: 25 }}
        className="fixed inset-0 z-20 flex flex-col items-center justify-center pointer-events-none p-4 sm:p-8 gap-4 max-h-screen overflow-hidden"
      >
        <div 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="relative pointer-events-auto w-[220px] sm:w-[260px] md:w-[300px] lg:w-[340px] xl:w-[360px] max-w-[75vw] flex items-center justify-center -translate-y-8 group"
        >
          {/* Subtle glow aura when generating/editing */}
          {isBusy && (
            <motion.div
              animate={{ opacity: [0.15, 0.35, 0.15], scale: [0.98, 1.03, 0.98] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -inset-8 bg-white/20 rounded-3xl blur-2xl -z-10"
            />
          )}

          {/* Minimalist Editorial Photo Print Frame */}
          <div 
            onClick={() => {
              if (activeImage.imageUrl && !isBusy && onSelect) {
                onSelect({
                  id: 'active',
                  imageUrl: activeImage.imageUrl,
                  prompt: activeImage.prompt || 'Active Concept',
                });
              }
            }}
            className={`photo-print rounded-xs p-3.5 sm:p-4 shadow-[0_30px_70px_rgba(0,0,0,0.3)] relative w-full flex flex-col ${
              activeImage.imageUrl && !isBusy ? 'cursor-pointer' : ''
            }`}
          >
            {/* Decorative White Tape Piece */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-32 h-8 tape-piece z-20 -rotate-1 rounded-xs pointer-events-none" />

            {/* Hover action delete button */}
            <div
              className={`absolute -top-3 -right-3 z-30 transition-opacity duration-200 ${
                isHovered && !isBusy && activeImage.imageUrl ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
                className="w-[28px] h-[28px] rounded-full bg-[rgba(245,240,232,0.95)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] flex items-center justify-center hover:bg-[#F5F0E8] transition-colors cursor-pointer"
                title="Delete image"
              >
                <X className="w-3.5 h-3.5 text-[#5A4E44] stroke-[2.2]" />
              </button>
            </div>

            {/* Image / Placeholder Box */}
            <div className="w-full aspect-square bg-[#120e0c] rounded-[2px] overflow-hidden relative flex flex-col items-center justify-center">
              {activeImage.imageUrl ? (
                <img
                  src={activeImage.imageUrl}
                  alt={activeImage.prompt || "Active creation"}
                  className={`w-full h-full object-cover transition-all duration-700 ${isBusy ? 'filter blur-[4px] brightness-75 scale-102' : ''}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center bg-[#15100e] relative overflow-hidden">
                  {/* Subtle animated ambient gradient inside placeholder */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/5 animate-pulse" />
                  
                  {/* Sleek loading spinner */}
                  <div className="w-10 h-10 border-2 border-white/15 border-t-white/90 rounded-full animate-spin mb-4 relative z-10" />
                  
                  <p className="font-sans text-xs sm:text-sm font-light text-white/70 tracking-widest uppercase relative z-10">
                    {activeImage.status === 'editing' ? 'Refining image...' : 'Developing photograph...'}
                  </p>
                </div>
              )}

              {/* Minimalist Loading Overlay over existing image when updating */}
              <AnimatePresence>
                {isBusy && activeImage.imageUrl && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center"
                  >
                    <div className="w-10 h-10 border-2 border-white/20 border-t-white/90 rounded-full animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
