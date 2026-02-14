// Inline editable text input with auto-sizing.
// Ported from TaskRow.jsx EditableText component.

import { useRef, useState, useLayoutEffect, type ChangeEvent, type CSSProperties } from 'react';

interface EditableTextProps {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  readOnly?: boolean;
}

export function EditableText({
  value,
  onChange,
  className = '',
  style,
  placeholder,
  readOnly = false,
}: EditableTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState('auto');

  useLayoutEffect(() => {
    if (spanRef.current) {
      setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`);
    }
  }, [value, placeholder]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (onChange) onChange(e.target.value);
  };

  return (
    <div className="relative max-w-full flex items-center no-drag">
      <span
        ref={spanRef}
        className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`}
        style={style}
        aria-hidden="true"
      >
        {value || placeholder || ''}
      </span>

      <input
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        className={`bg-transparent border border-transparent rounded px-1 -ml-1 transition-all outline-none truncate ${
          readOnly ? 'cursor-default' : 'cursor-text hover:border-gray-400/50'
        } ${className}`}
        style={{ ...(style || {}), width }}
      />
    </div>
  );
}
