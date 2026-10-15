export interface SourceChange {
  from: number;
  to: number;
  insert: string;
  /** Clipboard/source effects can retain their exact original line endings. */
  raw?: boolean;
}
export function normalizeSource(source: string): string {
  return source.replace(/\r\n|\r/g, "\n");
}
/** CodeMirror positions count each physical separator once, using UTF-16 offsets. */
export function sourceOffset(source: string, position: number): number {
  const offset = Math.max(
    0,
    Math.min(normalizeSource(source).length, position),
  );
  let extra = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    if (match.index - extra >= offset) break;
    extra += match[0].length - 1;
  }
  return offset + extra;
}
export function editorOffset(source: string, position: number): number {
  const offset = Math.max(0, Math.min(source.length, position));
  let extra = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    if (match.index >= offset) break;
    if (offset < match.index + match[0].length) return match.index - extra;
    extra += match[0].length - 1;
  }
  return offset - extra;
}
export function applySourceChanges(
  source: string,
  changes: readonly SourceChange[],
): string {
  const separator = source.match(/\r\n|\r|\n/)?.[0] ?? "\n";
  const length = normalizeSource(source).length;
  let cursor = 0,
    output = "";
  for (const change of changes) {
    if (change.from < cursor || change.to < change.from || change.to > length)
      throw Error("Invalid Markdown source change");
    output += source.slice(
      sourceOffset(source, cursor),
      sourceOffset(source, change.from),
    );
    output += change.raw
      ? change.insert
      : normalizeSource(change.insert).replaceAll("\n", separator);
    cursor = change.to;
  }
  return output + source.slice(sourceOffset(source, cursor));
}
/** Nonempty selections use half-open ranges; a collapsed caret reveals exactly one line. */
export function selectedLines(
  source: string,
  ranges: readonly { from: number; to: number }[],
): number[] {
  const text = normalizeSource(source),
    starts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") starts.push(i + 1);
  const lineAt = (position: number): number => {
    let low = 0,
      high = starts.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if ((starts[mid] ?? 0) <= position) low = mid;
      else high = mid;
    }
    return low + 1;
  };
  const selected = new Set<number>();
  for (const range of ranges) {
    const from = Math.max(
      0,
      Math.min(text.length, Math.min(range.from, range.to)),
    );
    const to = Math.max(
      0,
      Math.min(text.length, Math.max(range.from, range.to)),
    );
    for (
      let line = lineAt(from);
      line <= lineAt(to > from ? to - 1 : to);
      line++
    )
      selected.add(line);
  }
  return [...selected].sort((a, b) => a - b);
}
