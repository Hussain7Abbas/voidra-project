"use client";
import { useEffect, useId, useRef, useState } from "react";
import { DocumentationPage } from "./document-viewer.tsx";
import { flushFormDrafts } from "./form-drafts.tsx";
import { ProjectDecisions, ProjectGlossary } from "./project-knowledge.tsx";
import { useToast } from "./ui/toast.tsx";

export function KnowledgeWorkspace({
  initialTab = "Explore",
  onAction,
  onProfile,
}: {
  initialTab?: "Explore" | "Glossary" | "Decisions";
  onAction: (id: string) => void;
  onProfile: () => void;
}) {
  const [selected, setSelected] = useState(initialTab),
    id = useId(),
    toast = useToast();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const labels = ["Explore", "Glossary", "Decisions"] as const;
  useEffect(() => {
    const explore = () => setSelected("Explore");
    window.addEventListener("voidra-open-document", explore);
    return () => window.removeEventListener("voidra-open-document", explore);
  }, []);
  async function select(index: number, focus = false) {
    try {
      await flushFormDrafts();
      const label = labels[index];
      if (!label) return;
      setSelected(label);
      if (focus) buttons.current[index]?.focus();
    } catch (cause) {
      toast.error(String(cause));
    }
  }
  return (
    <>
      <div
        role="tablist"
        aria-label="Documentation sections"
        className="settings-tabs"
      >
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-${label}`}
            aria-controls={`${id}-${label}-panel`}
            aria-selected={selected === label}
            tabIndex={selected === label ? 0 : -1}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            onClick={() => void select(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : event.key === "ArrowRight"
                      ? (index + 1) % 3
                      : event.key === "ArrowLeft"
                        ? (index + 2) % 3
                        : null;
              if (next !== null) {
                event.preventDefault();
                void select(next, true);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {labels.map((label) => (
        <div
          key={label}
          role="tabpanel"
          id={`${id}-${label}-panel`}
          aria-labelledby={`${id}-${label}`}
          hidden={selected !== label}
        >
          {label === "Explore" ? (
            <DocumentationPage visible={selected === label} />
          ) : label === "Glossary" ? (
            <ProjectGlossary />
          ) : (
            <ProjectDecisions onAction={onAction} onProfile={onProfile} />
          )}
        </div>
      ))}
    </>
  );
}
