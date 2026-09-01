'use client';

import { useRef } from 'react';

export default function SearchField({ id, label, value, onChange, placeholder }) {
  const inputRef = useRef(null);

  function clearSearch() {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div className="search-field">
      <label htmlFor={id}>{label}</label>
      <div className="search-control">
        <span className="search-glyph" aria-hidden="true">/</span>
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        {value ? <button className="search-clear" type="button" aria-label="Limpiar búsqueda" onClick={clearSearch}>×</button> : null}
      </div>
    </div>
  );
}
