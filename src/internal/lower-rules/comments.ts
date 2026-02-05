/**
 * Tracks leading/trailing comments for StyleX properties.
 * Core concepts: comment metadata propagation and property mapping.
 */
export function addPropComments(
  target: any,
  prop: string,
  comments: { leading?: string | null; trailingLine?: string | null },
): void {
  if (!prop) {
    return;
  }
  const leading = comments.leading ?? null;
  const trailingLine = comments.trailingLine ?? null;
  if (!leading && !trailingLine) {
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
  if (trailingLine) {
    prev.trailingLine = trailingLine;
  }
  map[prop] = prev;
  (target as any)[key] = map;
}
