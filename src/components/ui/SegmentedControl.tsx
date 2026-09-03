import React from 'react';

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex w-full items-center justify-between rounded-full bg-[#183625] p-1 shadow-inner ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 rounded-full py-2.5 text-xs font-bold tracking-tight transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-[#D4F63D] text-[#122A1E] shadow-sm scale-[1.01]'
                : 'text-emerald-100/70 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
