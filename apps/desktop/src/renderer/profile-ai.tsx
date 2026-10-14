"use client";
import { useState } from "react";
import { AiSuggestionButton } from "./ai-suggestion.tsx";
import { Field } from "./ui/field.tsx";

export function ProfileAiControls({
  template,
  templateVersion,
  block,
  answer,
  value,
  onChange,
  disabled = false,
}: {
  template: string;
  templateVersion: string;
  block: string;
  answer: string;
  value: string | string[] | null;
  onChange: (value: string | string[] | null) => void;
  disabled?: boolean;
}) {
  const [questions, setQuestions] = useState("");
  const context = {
    template,
    templateVersion,
    block,
    answer,
    notes:
      value === null
        ? ""
        : `Current draft: ${Array.isArray(value) ? value.join(", ") : value}`,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <AiSuggestionButton
          label="Suggest answer with AI"
          intent={{ feature: "profile", ...context }}
          disabled={disabled}
          onApply={(suggestion) => {
            if (
              suggestion.feature === "profile" &&
              (suggestion.value === null ||
                typeof suggestion.value === "string" ||
                (Array.isArray(suggestion.value) &&
                  suggestion.value.every((value) => typeof value === "string")))
            )
              onChange(suggestion.value as string | string[] | null);
          }}
        />
        <AiSuggestionButton
          label="Suggest follow-up questions"
          intent={{ feature: "followup", ...context }}
          disabled={disabled}
          onApply={(suggestion) => {
            if (suggestion.feature === "followup")
              setQuestions(suggestion.questions.join("\n"));
          }}
        />
      </div>
      {questions && (
        <aside
          className="rounded-lg border border-line p-3"
          aria-label="Follow-up question suggestions"
        >
          <Field
            label="Questions to consider"
            hint="Edit these prompts and use them to refine your answer above. Save the answer when you are ready."
          >
            <textarea
              className="input"
              rows={4}
              value={questions}
              onChange={(event) => setQuestions(event.target.value)}
            />
          </Field>
        </aside>
      )}
    </div>
  );
}
