import React, { useRef, useState, useEffect } from 'react';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface FilterChipsProps {
  categories: Array<{ id: string; name: string }>;
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  showFilterIcon?: boolean;
  className?: string;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  showFilterIcon = true,
  className = '',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const checkScrollability = () => {
    const el = scrollContainerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }
  };

  useEffect(() => {
    checkScrollability();
    window.addEventListener('resize', checkScrollability);
    return () => window.removeEventListener('resize', checkScrollability);
  }, [categories]);

  // Smooth scroll buttons
  const scrollByAmount = (amount: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Enable mouse wheel horizontal scrolling on desktop
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
      checkScrollability();
    }
  };

  // Mouse Drag-to-Scroll handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    checkScrollability();
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className={`relative flex items-center group ${className}`}>
      {/* Left Scroll Arrow Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-180)}
          className="absolute left-0 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-(--surface)/95 text-(--ink) shadow-md border border-(--line)/80 hover:bg-(--surface-3) transition-all cursor-pointer"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4 stroke-[2.5]" />
        </button>
      )}

      {/* Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScrollability}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className={`flex items-center gap-2 overflow-x-auto py-2 w-full touch-pan-x select-none scroll-smooth transition-all ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent`}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* "All" chip */}
        <button
          type="button"
          onClick={() => onSelectCategory('ALL')}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            selectedCategoryId === 'ALL'
              ? 'bg-[#183625] text-[#D4F63D] shadow-sm'
              : 'bg-(--surface) border border-(--line)/80 text-(--ink-2) hover:bg-(--surface-2)'
          }`}
        >
          {showFilterIcon && <Filter className="h-3.5 w-3.5" />}
          <span>All</span>
        </button>

        {/* Category pills */}
        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`inline-flex shrink-0 items-center rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#183625] text-[#D4F63D] shadow-sm'
                  : 'bg-(--surface) border border-(--line)/80 text-(--ink-2) hover:bg-(--surface-2)'
              }`}
            >
              {cat.name}
            </button>
          );
        })}

        {/* Extra trailing spacing so last item is never clipped */}
        <div className="shrink-0 w-8 h-4" />
      </div>

      {/* Right Scroll Arrow Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(180)}
          className="absolute right-0 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-(--surface)/95 text-(--ink) shadow-md border border-(--line)/80 hover:bg-(--surface-3) transition-all cursor-pointer"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
};
