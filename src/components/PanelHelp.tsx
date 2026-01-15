import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface PanelHelpProps {
  text: string;
  icon: ReactNode;
}

export function PanelHelp({ text, icon }: PanelHelpProps) {
  const [open, setOpen] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const ignoreClickRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover)');
    const update = () => setHoverEnabled(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const openTooltip = () => setOpen(true);
  const closeTooltip = () => setOpen(false);
  const toggleTooltip = () => setOpen((prev) => !prev);

  return (
    <span className="panel__help-wrap" ref={wrapperRef}>
      <button
        type="button"
        className="panel__help"
        aria-label={text}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => {
          if (ignoreClickRef.current) {
            ignoreClickRef.current = false;
            return;
          }
          toggleTooltip();
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') {
            ignoreClickRef.current = true;
            toggleTooltip();
          }
        }}
        onMouseEnter={() => hoverEnabled && openTooltip()}
        onMouseLeave={() => hoverEnabled && closeTooltip()}
        onFocus={openTooltip}
        onBlur={(event) => {
          if (!hoverEnabled) return;
          if (!wrapperRef.current?.contains(event.relatedTarget as Node)) {
            closeTooltip();
          }
        }}
      >
        {icon}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`panel__help-tooltip${open ? ' is-open' : ''}`}
      >
        {text}
      </span>
    </span>
  );
}
