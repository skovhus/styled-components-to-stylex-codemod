/**
 * Tracks leading/trailing comments for StyleX properties.
 * Core concepts: comment metadata propagation and property mapping.
 */
export function addPropComments(
  target: any,
  prop: string,
  comments: { leading?: string | null; leadingLine?: string | null; trailingLine?: string | null },
): void {
  if (!prop) {
    return;
  }
  const leading = comments.leading ?? null;
  const leadingLine = comments.leadingLine ?? null;
  const trailingLine = comments.trailingLine ?? null;
  if (!leading && !leadingLine && !trailingLine) {
    return;
  }
  const key = "__propComments";
  const existing = (target as any)[key];
  const map =
    existing && typeof existing === "object" && !Array.isArray(existing) ? existing : ({} as any);
  const prev = (map[prop] && typeof map[prop] === "object" ? map[prop] : {}) as any;
  if (leading) {
    prev.leading = leading;
  }
  if (leadingLine) {
    prev.leadingLine = leadingLine;
  }
  if (trailingLine) {
    prev.trailingLine = trailingLine;
  }
  map[prop] = prev;
  (target as any)[key] = map;
}

/** Joins a new line comment onto an existing one, or returns it standalone. */
export function joinLineComment(existing: string | null | undefined, next: string): string {
  return existing ? `${existing}\n${next}` : next;
}

/**
 * Appends a leading line comment to a property, preserving any existing lines.
 * Unlike `addPropComments` (which overwrites `leadingLine`), this accumulates.
 * The append is idempotent: the same styleObj+prop can be visited by more than
 * one analysis pass, and a duplicated comment line is never desirable.
 */
export function appendPropLeadingLine(
  target: any,
  prop: string,
  line: string | null | undefined,
): void {
  if (!prop || !line) {
    return;
  }
  const existing = propLeadingLine(target, prop);
  if (existing && existing.split("\n").includes(line)) {
    return;
  }
  addPropComments(target, prop, { leadingLine: joinLineComment(existing, line) });
}

function propLeadingLine(target: any, prop: string): string | null {
  const comments = target?.__propComments;
  if (!comments || typeof comments !== "object" || Array.isArray(comments)) {
    return null;
  }
  const propComments = comments[prop];
  if (!propComments || typeof propComments !== "object") {
    return null;
  }
  return typeof propComments.leadingLine === "string" ? propComments.leadingLine : null;
}
