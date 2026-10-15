import { history, invertedEffects } from "@codemirror/commands";
import {
  Annotation,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  applySourceChanges,
  normalizeSource,
  type SourceChange,
} from "../shared/markdown-source.ts";

export const sourceSnapshot = StateEffect.define<string>();
export const rawPaste = Annotation.define<string>();
export const rawSource = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    if (tr.docChanged) {
      const changes: SourceChange[] = [];
      tr.changes.iterChanges((from, to, _fromB, _toB, insert) =>
        changes.push({ from, to, insert: insert.toString() }),
      );
      const pasted = tr.annotation(rawPaste);
      if (pasted !== undefined && changes.length === 1)
        changes[0] = {
          ...(changes[0] as SourceChange),
          insert: pasted,
          raw: true,
        };
      value = applySourceChanges(value, changes);
    }
    for (const effect of tr.effects)
      if (effect.is(sourceSnapshot)) value = effect.value;
    return value;
  },
});
export function sourceExtensions(source: string): Extension {
  return [
    rawSource.init(() => source),
    history(),
    invertedEffects.of((tr) =>
      tr.docChanged ? [sourceSnapshot.of(tr.startState.field(rawSource))] : [],
    ),
  ];
}
export function createMarkdownState(
  source: string,
  extensions: Extension = [],
): EditorState {
  return EditorState.create({
    doc: normalizeSource(source),
    extensions: [sourceExtensions(source), extensions],
  });
}
