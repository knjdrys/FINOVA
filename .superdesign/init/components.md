# Shared UI Primitives

## WaveCard
- File: `src/components/ui/WaveCard.tsx`
- Description: Signature dark emerald gradient card with interactive mathematical SVG sinusoidal wave animation, daily spending limit badge, and health metrics.

```tsx
import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { CurrencyCode } from '../../types';
import { SafeToSpendResult } from '../../domain/safe-to-spend/SafeToSpendEngine';
import { MoneyValue } from '../../domain/money/MoneyValue';

interface WaveCardProps {
  safeToSpend: SafeToSpendResult;
  currency: CurrencyCode;
  onOpenExplainer: () => void;
}

export const WaveCard: React.FC<WaveCardProps> = ({
  safeToSpend,
  currency,
  onOpenExplainer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      step += 0.04;

      // Draw primary wave
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      for (let x = 0; x < canvas.width; x++) {
        const y = Math.sin(x * 0.03 + step) * 12 + Math.cos(x * 0.015 - step) * 6 + canvas.height / 2;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(212, 246, 61, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw secondary softer wave
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      for (let x = 0; x < canvas.width; x++) {
        const y = Math.cos(x * 0.025 - step * 0.8) * 14 + canvas.height / 2;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const safeMoney = MoneyValue.fromMinorUnits(safeToSpend.safeToSpendToday, currency);

  return (
    <div
      data-tour="safe-to-spend-card"
      onClick={onOpenExplainer}
      className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-5 sm:p-6 text-white shadow-xl shadow-emerald-950/20 border border-emerald-800/40 cursor-pointer group transition-transform active:scale-[0.99]"
    >
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="absolute bottom-0 left-0 right-0 w-full h-28 opacity-40 pointer-events-none"
      />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#D4F63D] text-[#122A1E] shadow-sm">
              <Sparkles className="h-3.5 w-3.5 stroke-[2.5]" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
              Safe-To-Spend™ Today
            </span>
          </div>
          <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-black text-[#D4F63D] border border-emerald-300/30">
            {safeToSpend.status.replace('_', ' ')}
          </span>
        </div>

        <div>
          <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {safeMoney.format()}
          </div>
          <p className="text-xs text-emerald-200/80 font-medium mt-0.5">
            Safe to spend without touching bills or savings
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] font-bold text-emerald-300 group-hover:text-white transition-colors">
          <span>Tap for Safe-to-Spend Breakdown</span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
};
```

## FilterChips
- File: `src/components/ui/FilterChips.tsx`
- Description: Horizontally scrollable category filter pills with mouse drag, mouse wheel, and navigation chevron buttons.

```tsx
import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface FilterChipItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface FilterChipsProps {
  items: FilterChipItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  items,
  selectedId,
  onSelect,
  className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [items]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = 160;
    el.scrollBy({ left: direction === 'left' ? -distance : distance, behavior: 'smooth' });
  };

  return (
    <div className={`relative group/chips ${className}`}>
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="absolute -left-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 scroll-smooth pr-8"
      >
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shrink-0 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#122A1E] text-[#D4F63D] shadow-sm ring-1 ring-emerald-800'
                  : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="absolute -right-2 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
```

## Modal
- File: `src/components/ui/Modal.tsx`
- Description: Reusable animated modal sheet with backdrop blur and responsive bottom sheet sizing.

```tsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] bg-[#F7F7F2] p-5 sm:p-6 shadow-2xl border border-slate-200/80 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/80">
          <h3 className="text-base sm:text-lg font-black text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/80 text-slate-700 hover:bg-slate-300 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
};
```
