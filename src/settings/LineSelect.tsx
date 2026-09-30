import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: string };

type LineSelectProps = {
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
  "aria-label"?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number; openUp: boolean };

export function LineSelect({ value, options, disabled, onChange, "aria-label": ariaLabel }: LineSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return;
    }

    const update = () => {
      const trigger = rootRef.current?.querySelector(".line-select-trigger");
      if (!(trigger instanceof HTMLElement)) return;
      const r = trigger.getBoundingClientRect();
      const gap = 6;
      const pad = 12;
      const preferred = Math.min(280, options.length * 40 + 14);
      const spaceBelow = window.innerHeight - r.bottom - gap - pad;
      const spaceAbove = r.top - gap - pad;
      const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(preferred, openUp ? spaceAbove : spaceBelow));
      const width = Math.max(r.width, 140);
      let left = r.right - width;
      left = Math.min(Math.max(pad, left), window.innerWidth - width - pad);
      const top = openUp ? r.top - gap - maxHeight : r.bottom + gap;
      setPos({ top, left, width, maxHeight, openUp });
    };

    update();
    window.addEventListener("resize", update);
    // Capture scroll on any ancestor so position stays glued to the trigger
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`line-select${open ? " open" : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="line-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? ""}</span>
        <span className="line-select-caret" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            className={`line-select-menu${pos.openUp ? " up" : ""}`}
            id={listId}
            role="listbox"
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={o.value === value ? "line-select-option active" : "line-select-option"}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
