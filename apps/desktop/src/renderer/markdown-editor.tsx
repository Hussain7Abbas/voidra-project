"use client";
import { defaultKeymap, historyKeymap, redo, undo } from "@codemirror/commands";
import {
  Compartment,
  EditorState,
  type Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder,
  WidgetType,
} from "@codemirror/view";
import { useEffect, useId, useRef, useState } from "react";
import { markdownPresentation } from "../shared/markdown-presentation.ts";
import {
  normalizeSource,
  selectedLines,
  sourceOffset,
} from "../shared/markdown-source.ts";
import {
  createMarkdownState,
  rawPaste,
  rawSource,
  sourceSnapshot,
} from "./markdown-engine.ts";

const focusEffect = StateEffect.define<boolean>();
const focused = StateField.define({
  create: () => false,
  update: (value, tr) =>
    tr.effects.find((effect) => effect.is(focusEffect))?.value ?? value,
});
class TextWidget extends WidgetType {
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  override eq(other: TextWidget): boolean {
    return this.text === other.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-symbol";
    span.textContent = this.text;
    return span;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}
function decorate(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  const active = state.field(focused)
    ? selectedLines(source, state.selection.ranges)
    : [];
  const model = markdownPresentation(source, active),
    ranges: Range<Decoration>[] = [];
  for (const span of model.hidden)
    ranges.push(Decoration.replace({}).range(span.from, span.to));
  for (const span of model.marks)
    ranges.push(
      Decoration.mark({ class: span.className }).range(span.from, span.to),
    );
  for (const line of model.lines)
    ranges.push(
      Decoration.line({
        attributes: {
          class: line.className,
          "data-source-line": String(line.number),
        },
      }).range(line.from),
    );
  for (const widget of model.widgets)
    ranges.push(
      Decoration.widget({
        widget: new TextWidget(widget.text),
        side: -1,
      }).range(widget.from),
    );
  return Decoration.set(ranges, true);
}
const decorations = StateField.define<DecorationSet>({
  create: decorate,
  update: (value, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.effects.some((effect) => effect.is(focusEffect))
      ? decorate(tr.state)
      : value,
  provide: (field) => EditorView.decorations.from(field),
});

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  documentKey?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}
function contentAttributes(
  props: MarkdownEditorProps,
  error: string,
  hintId: string,
  errorId: string,
) {
  return {
    ...(props.id ? { id: props.id } : {}),
    ...(props["aria-label"]
      ? { "aria-label": props["aria-label"] as string }
      : {}),
    ...(props["aria-labelledby"]
      ? { "aria-labelledby": props["aria-labelledby"] as string }
      : {}),
    "aria-describedby": [
      props["aria-describedby"],
      hintId,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" "),
    "aria-required": String(props.required ?? false),
    "aria-invalid": String(!!error || !!props["aria-invalid"]),
    "aria-disabled": String(props.disabled ?? false),
    spellcheck: "true",
    tabindex: "0",
  };
}

/** Source stays canonical. Formatting is replaced only outside cursor/selection lines. */
export function MarkdownEditor(props: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    live = useRef(props);
  live.current = props;
  const attributes = useRef(new Compartment()),
    id = useId();
  const [fallback, setFallback] = useState(false),
    [error, setError] = useState("");
  const hintId = `${id}-editing`,
    errorId = `${id}-error`;
  useEffect(() => {
    if (!host.current || fallback) return;
    host.current.dataset.documentKey = props.documentKey ?? "";
    let editor: EditorView | null = null;
    try {
      const nonce = document
        .querySelector('meta[name="voidra-style-nonce"]')
        ?.getAttribute("content");
      if (!nonce || !/^[A-Za-z0-9_-]{32}$/.test(nonce))
        throw Error("Missing editor style authorization");
      editor = new EditorView({
        parent: host.current,
        state: createMarkdownState(live.current.value, [
          focused,
          decorations,
          EditorView.lineWrapping,
          EditorView.cspNonce.of(nonce),
          attributes.current.of([
            EditorView.contentAttributes.of(
              contentAttributes(live.current, "", hintId, errorId),
            ),
            EditorView.editable.of(!live.current.disabled),
            EditorState.readOnly.of(!!live.current.disabled),
          ]),
          EditorView.focusChangeEffect.of((_state, focus) =>
            focusEffect.of(focus),
          ),
          placeholder(live.current.placeholder ?? "Write Markdown…"),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          EditorView.exceptionSink.of(() => setFallback(true)),
          EditorView.updateListener.of((update) => {
            if (
              !update.docChanged &&
              !update.transactions.some((tr) =>
                tr.effects.some((effect) => effect.is(sourceSnapshot)),
              )
            )
              return;
            const value = update.state.field(rawSource);
            setError("");
            if (
              !update.transactions.every((tr) =>
                tr.isUserEvent("input.external"),
              )
            )
              live.current.onChange(value);
          }),
          EditorView.domEventHandlers({
            paste(event, editor) {
              if (live.current.disabled) return false;
              const text = event.clipboardData?.getData("text/plain");
              if (text === undefined) return false;
              event.preventDefault();
              const range = editor.state.selection.main;
              editor.dispatch({
                changes: {
                  from: range.from,
                  to: range.to,
                  insert: normalizeSource(text),
                },
                selection: {
                  anchor: range.from + normalizeSource(text).length,
                },
                annotations: rawPaste.of(text),
                userEvent: "input.paste",
                scrollIntoView: true,
              });
              return true;
            },
            copy: (event, editor) => copySource(event, editor, false),
            cut: (event, editor) => copySource(event, editor, true),
          }),
        ]),
      });
      const instance = editor;
      instance.dom.addEventListener("voidra-text-edit", (event) => {
        if (!(event instanceof CustomEvent)) return;
        if (event.detail !== "undo" && event.detail !== "redo") return;
        event.preventDefault();
        if (!instance.state.readOnly)
          (event.detail === "undo" ? undo : redo)(instance);
      });
      view.current = editor;
    } catch {
      editor?.destroy();
      view.current = null;
      setFallback(true);
    }
    return () => {
      editor?.destroy();
      view.current = null;
    };
  }, [fallback, props.documentKey, hintId, errorId]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: attributes.current.reconfigure([
        EditorView.contentAttributes.of(
          contentAttributes(props, error, hintId, errorId),
        ),
        EditorView.editable.of(!props.disabled),
        EditorState.readOnly.of(!!props.disabled),
      ]),
    });
  }, [props, error, hintId, errorId]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || props.value === editor.state.field(rawSource)) return;
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: normalizeSource(props.value),
      },
      effects: sourceSnapshot.of(props.value),
      selection: {
        anchor: Math.min(
          editor.state.selection.main.head,
          normalizeSource(props.value).length,
        ),
      },
      userEvent: "input.external",
    });
  }, [props.value]);
  useEffect(() => {
    if (fallback) return;
    const form = host.current?.closest("form");
    if (!form) return;
    const validate = (event: Event) => {
      const value = view.current?.state.field(rawSource) ?? live.current.value;
      const message =
        live.current.required && !value.trim()
          ? "Enter a description."
          : live.current.maxLength && value.length > live.current.maxLength
            ? `Use ${live.current.maxLength} characters or fewer.`
            : "";
      if (message) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setError(message);
        view.current?.focus();
      }
    };
    form.addEventListener("submit", validate, true);
    return () => form.removeEventListener("submit", validate, true);
  }, [fallback]);
  return (
    <div className="markdown-editor">
      {fallback ? (
        <>
          <p role="status" className="field-hint">
            Markdown formatting is unavailable. Your original source remains
            editable.
          </p>
          <textarea
            className="input"
            id={props.id}
            aria-label={props["aria-label"]}
            aria-labelledby={props["aria-labelledby"]}
            aria-describedby={props["aria-describedby"]}
            aria-invalid={props["aria-invalid"]}
            required={props.required}
            disabled={props.disabled}
            maxLength={props.maxLength}
            rows={props.rows ?? 6}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </>
      ) : (
        <div
          ref={host}
          className={`markdown-editor-surface ${props.disabled ? "is-disabled" : ""}`}
        />
      )}
      <p id={hintId} className="field-hint">
        Markdown is rendered here. The cursor line and selected lines show their
        source.
      </p>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function copySource(
  event: ClipboardEvent,
  view: EditorView,
  cut: boolean,
): boolean {
  if (!event.clipboardData) return false;
  const range = view.state.selection.main;
  if (range.empty) return false;
  event.preventDefault();
  const source = view.state.field(rawSource);
  event.clipboardData.setData(
    "text/plain",
    source.slice(
      sourceOffset(source, range.from),
      sourceOffset(source, range.to),
    ),
  );
  if (cut && !view.state.readOnly)
    view.dispatch({
      changes: { from: range.from, to: range.to },
      selection: { anchor: range.from },
      userEvent: "delete.cut",
      scrollIntoView: true,
    });
  return true;
}
