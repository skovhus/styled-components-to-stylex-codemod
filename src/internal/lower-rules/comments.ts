/**
 * Tracks leading/trailing comments for StyleX properties.
 * Core concepts: comment metadata propagation and property mapping.
 */
export type PropCommentMetadata = {
  leading?: string | null;
  leadingLine?: string | null;
  trailingLine?: string | null;
};

export function addPropComments(target: any, prop: string, comments: PropCommentMetadata): void {
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

export function propagatePropComments(
  target: Record<string, unknown>,
  sourceProp: string,
  targetProps: readonly string[],
): void {
  const sourceComments = propCommentsFor(target, sourceProp);
  if (!sourceComments) {
    return;
  }
  for (const targetProp of targetProps) {
    if (!(targetProp in target)) {
      continue;
    }
    copyPropComments(target, targetProp, sourceComments);
  }
}

function copyPropComments(
  target: Record<string, unknown>,
  targetProp: string,
  comments: PropCommentMetadata,
): void {
  const existing = propCommentsFor(target, targetProp);
  addPropComments(target, targetProp, {
    leading: existing?.leading ?? comments.leading,
    trailingLine: existing?.trailingLine ?? comments.trailingLine,
  });
  appendPropLeadingLine(target, targetProp, comments.leadingLine);
}

function propCommentsFor(target: unknown, prop: string): PropCommentMetadata | null {
  const propComments = isRecord(target) ? target.__propComments : null;
  if (!isRecord(propComments)) {
    return null;
  }
  const metadata = propComments[prop];
  if (!isRecord(metadata)) {
    return null;
  }
  const comments = {
    leading: stringValue(metadata.leading),
    leadingLine: stringValue(metadata.leadingLine),
    trailingLine: stringValue(metadata.trailingLine),
  };
  return comments.leading || comments.leadingLine || comments.trailingLine ? comments : null;
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
  return propCommentsFor(target, prop)?.leadingLine ?? null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
