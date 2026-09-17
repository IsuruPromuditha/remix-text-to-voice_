import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { MoodboardItem } from '../types';
import { X } from 'lucide-react';

interface MoodboardCardProps {
  item: MoodboardItem;
  onBringToFront: (id: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onSelect: (item: MoodboardItem) => void;
  hasCenterContent?: boolean;
}

export const MoodboardCard: React.FC<MoodboardCardProps> = ({
  item,
  onBringToFront,
  onUpdatePosition,
  onDelete,
  onSelect,
  hasCenterContent = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<{ x: number; y: number; itemX: number; itemY: number }>({ x: 0, y: 0, itemX: 0, itemY: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    // If clicking a button, do not capture or start drag
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // Only drag with primary mouse button
    if (e.button !== 0) return;
    e.stopPropagation();
    onBringToFront(item.id);
    setIsDragging(true);

    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      itemX: item.x,
      itemY: item.y,
    };

    if (cardRef.current) {
      cardRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;

    // Convert pixel delta to percentage of screen width/height roughly
    const deltaPercentX = (deltaX / window.innerWidth) * 100;
    const deltaPercentY = (deltaY / window.innerHeight) * 100;

    let marginX = 6;
    let marginY = 8;

    if (cardRef.current && typeof window !== 'undefined') {
      const rect = cardRef.current.getBoundingClientRect();
      // Increase margin by 5% to account for rotation bounding boxes sticking out
      marginX = (((rect.width / 2) * 1.05) / window.innerWidth) * 100; 
      marginY = (((rect.height / 2) * 1.05) / window.innerHeight) * 100;
    }

    // Symmetric clamping for drag bounds
    const minX = marginX + 1.0;
    const maxX = 100 - marginX - 1.0;
    let newX = Math.max(minX, Math.min(maxX, startPosRef.current.itemX + deltaPercentX));
    
    if (hasCenterContent && typeof window !== 'undefined') {
      const centerExclusionHalfW_pct = Math.min(18, (190 / window.innerWidth) * 100);
      if (newX <= 50) {
        newX = Math.min(newX, 50 - centerExclusionHalfW_pct - marginX);
      } else {
        newX = Math.max(newX, 50 + centerExclusionHalfW_pct + marginX);
      }
    }

    const transcriptHalfW_pct = typeof window !== 'undefined' ? (300 / window.innerWidth) * 100 : 25;
    const overlapsRedZone = Math.abs(newX - 50) < (transcriptHalfW_pct + marginX);
    const bottomSafe_pct = typeof window !== 'undefined' ? (190 / window.innerHeight) * 100 : 24;
    const maxAllowedY = overlapsRedZone ? 100 - bottomSafe_pct - marginY : 100 - marginY - 2;

    const minY = marginY + 11;
    const newY = Math.max(minY, Math.min(maxAllowedY, startPosRef.current.itemY + deltaPercentY));

    onUpdatePosition(item.id, newX, newY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    if (!isDragging) return;
    setIsDragging(false);
    if (cardRef.current) {
      try {
        cardRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    // Check if it was a quick click vs a drag
    const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
    if (dist < 5) {
      onSelect(item);
    }
  };

  // Generate organic tape style variations per card based on item ID
  const getTapeStyle = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    const abs = Math.abs(hash);
    const width = 86 + (abs % 46); // Vary tape width between 86px and 132px
    const rotation = ((abs % 11) - 5); // Vary rotation between -5deg and +5deg
    const xOffset = ((abs % 15) - 7); // Vary horizontal placement offset -7px to +7px
    return {
      width: `${width}px`,
      transform: `translateX(calc(-50% + ${xOffset}px)) rotate(${rotation}deg)`,
    };
  };

  const effectiveScale = item.scale || 1;

  // Dynamically calculate safe boundaries allowing generous scatter without falling off screen edges
  // Enforces strict safety zones: Top bar (Y < 16%), Spoken Text/Mic bottom center, and Middle Hero Image
  const getSafeCoords = (x: number, y: number) => {
    // Add 15% padding to account for rotation corners sticking out and drop shadows
    const cardW_px = typeof window !== 'undefined' ? Math.min(280, window.innerWidth * 0.28) : 280;
    const cardH_px = cardW_px * 1.1;
    const halfWidthPercent = typeof window !== 'undefined' ? (((cardW_px * effectiveScale) / 2) * 1.15 / window.innerWidth) * 100 : 12 * effectiveScale;
    const halfHeightPercent = typeof window !== 'undefined' ? (((cardH_px * effectiveScale) / 2) * 1.15 / window.innerHeight) * 100 : 14 * effectiveScale;

    // Symmetric clamping: keep card on-screen
    const minX = halfWidthPercent + 1.0;
    const maxX = 100 - halfWidthPercent - 1.0;
    let safeX = Math.max(minX, Math.min(maxX, x));

    if (hasCenterContent && typeof window !== 'undefined') {
      const centerExclusionHalfW_pct = Math.min(18, (190 / window.innerWidth) * 100);
      if (safeX <= 50) {
        safeX = Math.min(safeX, 50 - centerExclusionHalfW_pct - halfWidthPercent);
      } else {
        safeX = Math.max(safeX, 50 + centerExclusionHalfW_pct + halfWidthPercent);
      }
    }

    // Keep below header
    const minY = halfHeightPercent + 11;

    const transcriptHalfW_pct = typeof window !== 'undefined' ? (300 / window.innerWidth) * 100 : 25;
    const overlapsRedZone = Math.abs(safeX - 50) < (transcriptHalfW_pct + halfWidthPercent);
    
    const bottomSafe_pct = typeof window !== 'undefined' ? (190 / window.innerHeight) * 100 : 24;
    const maxY = overlapsRedZone ? 100 - bottomSafe_pct - halfHeightPercent : 100 - halfHeightPercent - 2;
    
    const safeY = Math.max(minY, Math.min(maxY, y));

    return { safeX, safeY };
  };

  const { safeX, safeY } = getSafeCoords(item.x, item.y);

  return (
    <div
      ref={cardRef}
      style={{
        left: `${safeX}%`,
        top: `${safeY}%`,
        zIndex: isDragging ? 9999 : item.zIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing select-none group"
    >
      <motion.div
        initial={{ scale: effectiveScale * 0.8, opacity: 0, y: 30 }}
        animate={{
          scale: isDragging ? effectiveScale * 1.08 : effectiveScale,
          opacity: 1,
          y: 0,
          rotate: isDragging ? 0 : item.rotation,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative"
      >
        {/* Decorative White Tape Piece with organic width, tilt & position */}
        <div
          className="absolute -top-4 left-1/2 h-8 tape-piece z-20 rounded-xs pointer-events-none"
          style={getTapeStyle(item.id)}
        />

        {/* Sleek Photo Print Container without caption */}
        <div className="photo-print rounded-xs w-[170px] sm:w-[210px] md:w-[250px] lg:w-[280px] max-w-[28vw] relative transition-shadow">
          {/* Hover action bar */}
          <div
            className={`absolute -top-3 -right-3 z-30 transition-opacity duration-200 ${
              isHovered && !isDragging ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="w-[26px] h-[26px] rounded-full bg-[rgba(245,240,232,0.95)] shadow-[0_2px_6px_rgba(0,0,0,0.18)] flex items-center justify-center hover:bg-[#F5F0E8] transition-colors cursor-pointer"
              title="Delete from board"
            >
              <X className="w-3.5 h-3.5 text-[#5A4E44] stroke-[2.2]" />
            </button>
          </div>

          {/* Image Display */}
          <div className="w-full aspect-square bg-[#1a1412] overflow-hidden rounded-[2px] relative">
            <img
              src={item.imageUrl}
              alt={item.prompt}
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};
