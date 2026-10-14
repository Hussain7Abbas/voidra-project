"use client";
import { type ReactNode, useId, useRef, useState } from "react";

export function SettingsTabs({
  general,
  appearance,
}: {
  general: ReactNode;
  appearance: ReactNode;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings categories"
      >
        {["General", "Appearance"].map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 1
                    : event.key === "ArrowRight" || event.key === "ArrowLeft"
                      ? 1 - index
                      : null;
              if (next === null) return;
              event.preventDefault();
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {[
        { label: "General", content: general },
        { label: "Appearance", content: appearance },
      ].map(({ label, content }, index) => (
        <div
          key={label}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={selected !== index}
        >
          {content}
        </div>
      ))}
    </>
  );
}
