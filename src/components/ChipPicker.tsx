"use client";

import { useState, useRef } from "react";

export function parseChips(str: string): string[] {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

interface ChipPickerProps {
  id: string;
  label: string;
  suggestions: string[];
  selected: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
}

export function ChipPicker({
  id,
  label,
  suggestions,
  selected,
  onChange,
  placeholder = "Add your own…",
}: ChipPickerProps) {
  const [customValue, setCustomValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLower = selected.map((s) => s.toLowerCase());
  const unselected = suggestions.filter(
    (s) => !selectedLower.includes(s.toLowerCase())
  );

  function addChip(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (selectedLower.includes(trimmed.toLowerCase())) return;
    onChange([...selected, trimmed]);
  }

  function removeChip(chip: string) {
    onChange(selected.filter((s) => s.toLowerCase() !== chip.toLowerCase()));
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(customValue);
      setCustomValue("");
    }
  }

  return (
    <div>
      <span className="ct-label">{label}</span>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-2 min-h-[2rem] items-center">
        {selected.length > 0 ? (
          selected.map((chip) => (
            <span
              key={chip}
              className="ct-tag inline-flex items-center gap-1"
            >
              {chip}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-ct-muted">No selections yet</span>
        )}
      </div>

      <hr className="border-ct-rule my-2" />

      {/* Suggestions + custom input */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-ct-rule bg-ct-paper pr-1.5">
          <input
            ref={inputRef}
            type="text"
            id={id}
            name={id}
            autoComplete="off"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            onBlur={() => {
              if (customValue.trim()) {
                addChip(customValue);
                setCustomValue("");
              }
            }}
            placeholder={placeholder}
            className="rounded-full bg-transparent pl-3 py-1 text-xs font-ui text-ct-ink placeholder:text-ct-rule focus:outline-none w-28"
          />
          <button
            type="button"
            onClick={() => {
              addChip(customValue);
              setCustomValue("");
              inputRef.current?.focus();
            }}
            className="flex items-center justify-center w-4 h-4 rounded-full border border-ct-rule text-ct-muted hover:text-ct-ink hover:border-ct-muted transition-colors"
            aria-label="Add custom value"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 1v8M1 5h8" />
            </svg>
          </button>
        </span>
        {unselected.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => addChip(option)}
            className="rounded-full px-3 py-1 text-xs font-ui bg-ct-cream text-ct-muted hover:text-ct-ink hover:bg-ct-rule transition-colors"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
