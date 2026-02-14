// Inline editable text input with auto-sizing and debounced updates.
// Local state keeps typing responsive, debounced callback prevents store thrashing.

import { useRef, useState, useEffect, useLayoutEffect, useCallback, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react';

interface EditableTextProps {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  readOnly?: boolean;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
}

export function EditableText({
  value,
  onChange,
  className = '',
  style,
  placeholder,
  readOnly = false,
  debounceMs = 300,
}: EditableTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState('auto');
  const [localValue, setLocalValue] = useState(value);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useLayoutEffect(() => {
    if (spanRef.current) {
      setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`);
    }
  }, [localValue, placeholder]);

  // Flush pending debounce
  const flush = useCallback(() => {
    if (pendingRef.current !== null) {
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
    // Call onChange with current local value
    if (onChange && inputRef.current) {
      const current = inputRef.current.value;
      if (current !== value) {
        onChange(current);
      }
    }
  }, [onChange, value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    if (!onChange) return;

    // Clear pending debounce
    if (pendingRef.current !== null) {
      clearTimeout(pendingRef.current);
    }

    // Schedule debounced update
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      onChange(newVal);
    }, debounceMs);
  };

  const handleBlur = () => {
    // Flush immediately on blur
    flush();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      flush();
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      // Revert to original value
      setLocalValue(value);
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
      inputRef.current?.blur();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current);
      }
    };
  }, []);

  return (
    <div className="relative max-w-full flex items-center no-drag">
      <span
        ref={spanRef}
        className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`}
        style={style}
        aria-hidden="true"
      >
        {localValue || placeholder || ''}
      </span>

      <input
        ref={inputRef}
        value={localValue ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        className={`bg-transparent border border-transparent rounded px-1 -ml-1 transition-all outline-none truncate ${
          readOnly ? 'cursor-default' : 'cursor-text hover:border-gray-400/50 focus:border-blue-400/50'
        } ${className}`}
        style={{ ...(style || {}), width }}
      />
    </div>
  );
}
