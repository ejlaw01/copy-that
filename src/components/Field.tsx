"use client";

interface FieldProps {
  id?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  maxLength?: number;
}

export function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  multiline,
  maxLength,
}: FieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="ct-label">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          name={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={3}
          className="ct-textarea resize-none"
        />
      ) : (
        <input
          id={id}
          name={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="ct-input"
        />
      )}
    </label>
  );
}
