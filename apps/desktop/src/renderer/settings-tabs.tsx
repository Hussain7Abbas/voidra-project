"use client";
import { type ReactNode, useId, useRef, useState } from "react";

export function SettingsTabs({
  general,
  appearance,
  team,
  initialTab = 0,
}: {
  general: ReactNode;
  appearance: ReactNode;
  team?: ReactNode;
  initialTab?: number;
}) {
  const id = useId();
  const [selected, setSelected] = useState(initialTab);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = [
    { label: "General", content: general },
    { label: "Appearance", content: appearance },
    ...(team ? [{ label: "Team", content: team }] : []),
  ];
  return (
    <>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings categories"
      >
        {panels.map(({ label }, index) => (
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
                    ? panels.length - 1
                    : event.key === "ArrowRight" || event.key === "ArrowLeft"
                      ? (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          panels.length) %
                        panels.length
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
      {panels.map(({ label, content }, index) => (
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
