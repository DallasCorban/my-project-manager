import React, { useRef, useState, useLayoutEffect } from "react";

const EditableText = ({
  value,
  onChange,
  className,
  style,
  placeholder,
  autoFocus,
  onBlur,
}) => {
  const spanRef = useRef(null);
  const [width, setWidth] = useState("auto");

  useLayoutEffect(() => {
    if (spanRef.current) {
      setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`);
    }
  }, [value, placeholder]);

  return (
    <div className="relative max-w-full flex items-center no-drag">
      <span
        ref={spanRef}
        className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`}
        style={style}
        aria-hidden="true"
      >
        {value || placeholder || ""}
      </span>

      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        className={`bg-transparent border border-transparent hover:border-gray-400/50 rounded px-1 -ml-1 transition-all outline-none cursor-text truncate ${className}`}
        style={{ ...style, width }}
      />
    </div>
  );
};

export default EditableText;
