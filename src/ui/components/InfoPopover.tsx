import { useState, useRef, useEffect, useLayoutEffect, type ReactNode, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoPopoverProps {
  title?: string;
  children: ReactNode;
  ariaLabel?: string;
  buttonClassName?: string;
  iconClassName?: string;
}

type PopoverPlacement = 'top' | 'bottom';

export function InfoPopover({
  title,
  children,
  ariaLabel = 'Weitere Informationen',
  buttonClassName = '',
  iconClassName = '',
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: PopoverPlacement } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const margin = 8;

    const pop = popoverRef.current;
    const popW = pop?.offsetWidth ?? 320;
    const popH = pop?.offsetHeight ?? 180;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + margin;
    let placement: PopoverPlacement = 'bottom';

    if (left + popW > vw - margin) left = Math.max(margin, vw - popW - margin);
    if (left < margin) left = margin;

    if (top + popH > vh - margin) {
      const topAlt = rect.top - margin - popH;
      if (topAlt >= margin) {
        top = topAlt;
        placement = 'top';
      } else {
        top = Math.max(margin, vh - popH - margin);
      }
    }

    setPos({ top, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const id = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handle = () => updatePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`w-6 h-6 rounded-full border border-slate-300 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors inline-flex items-center justify-center ${buttonClassName}`.trim()}
      >
        <Info className={`w-4 h-4 text-slate-500 ${iconClassName}`.trim()} />
      </button>

      {isOpen && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[1000] max-w-sm w-[min(360px,calc(100vw-16px))] bg-white border border-slate-200 shadow-xl rounded-xl p-3 text-sm"
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
          role="dialog"
          aria-label={ariaLabel}
        >
          {title && <div className="font-semibold text-slate-900 mb-2">{title}</div>}
          <div className="text-slate-600 leading-relaxed max-h-[70vh] overflow-auto">
            {children}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
