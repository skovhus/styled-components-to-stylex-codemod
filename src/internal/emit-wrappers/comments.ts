import type { ASTNode, Comment } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";

type CommentableNode = ASTNode & { leadingComments?: Comment[]; comments?: Comment[] };

const isBugNarrativeComment = (c: Comment | undefined): boolean => {
  if (!c) {
    return false;
  }
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^Bug\s+\d+[a-zA-Z]?\s*:/.test(v);
};

// Check if a comment looks like a section header (e.g., "Pattern 1:", "Case 2:", etc.)
const isSectionHeaderComment = (c: Comment | undefined): boolean => {
  if (!c) {
    return false;
  }
  const v = typeof c?.value === "string" ? String(c.value).trim() : "";
  return /^(Pattern|Case|Example|Test|Step|Note)\s*\d*[a-zA-Z]?\s*:/.test(v);
};

const getWrapperLeadingComments = (d: StyledDecl): Comment[] | null => {
  const cs = (d as { leadingComments?: Comment[] }).leadingComments;
  if (!Array.isArray(cs) || cs.length === 0) {
    return null;
  }

  // Find the Bug N: comment index
  let bugIdx = -1;
  for (let i = 0; i < cs.length; i++) {
    if (isBugNarrativeComment(cs[i])) {
      bugIdx = i;
      break;
    }
  }

  if (bugIdx < 0) {
    // No Bug comment, return all comments
    return cs;
  }

  // For "Bug N:" narrative comment runs we treat those as file-level (migrated near `const styles`)
  // and avoid attaching any part of that narrative onto wrapper functions (to prevent duplication).
  //
  // However, if there are additional comments *after a gap* (blank line) following the Bug narrative,
  // those are typically local section headers (e.g. "Pattern 1: ...") and are safe to attach.
  // We only attach them if the first post-gap comment is a recognized section header.
  let lastLine = cs[bugIdx]?.loc?.end?.line ?? cs[bugIdx]?.loc?.start?.line ?? -1;
  let i = bugIdx + 1;
  // Skip the contiguous Bug narrative block (no blank line gaps).
  for (; i < cs.length; i++) {
    const c = cs[i];
    const startLine = c?.loc?.start?.line ?? -1;
    if (lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1) {
      break;
    }
    lastLine = c?.loc?.end?.line ?? startLine;
  }
  if (i >= cs.length) {
    return null;
  }

  // Only attach post-gap comments if the first one is a section header.
  // This prevents attaching general explanatory text (like "When these are exported...")
  // to wrapper functions.
  if (!isSectionHeaderComment(cs[i])) {
    return null;
  }

  // Collect the next contiguous comment block (until the next gap).
  const result: Comment[] = [];
  lastLine = cs[i]?.loc?.end?.line ?? cs[i]?.loc?.start?.line ?? -1;
  for (; i < cs.length; i++) {
    const c = cs[i];
    const startLine = c?.loc?.start?.line ?? -1;
    if (result.length > 0 && lastLine >= 0 && startLine >= 0 && startLine > lastLine + 1) {
      break;
    }
    if (c) {
      result.push(c);
    }
    lastLine = c?.loc?.end?.line ?? startLine;
  }

  return result.length > 0 ? result : null;
};

export const withLeadingComments = (node: ASTNode, d: StyledDecl): ASTNode => {
  const cs = getWrapperLeadingComments(d);
  if (!cs) {
    return node;
  }
  const normalized = cs.map((c) => ({ ...c, leading: true, trailing: false }));

  // Merge (don't overwrite) to avoid clobbering comments that are already correctly attached by
  // the parser/printer, and dedupe to prevent double-printing.
  const commentable = node as CommentableNode;
  const existingLeading = Array.isArray(commentable.leadingComments)
    ? commentable.leadingComments
    : [];
  const existingComments = Array.isArray(commentable.comments) ? commentable.comments : [];
  const merged = [...existingLeading, ...existingComments, ...normalized] as Comment[];
  const seen = new Set<string>();
  const deduped = merged.filter((c) => {
    const key = `${(c as { type?: string })?.type ?? "Comment"}:${String(
      (c as { value?: string })?.value ?? "",
    ).trim()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  commentable.leadingComments = deduped;
  commentable.comments = deduped;
  return node;
};

export const withLeadingCommentsOnFirstFunction = (nodes: ASTNode[], d: StyledDecl): ASTNode[] => {
  let done = false;
  return nodes.map((n) => {
    if (done) {
      return n;
    }
    if (n?.type === "FunctionDeclaration") {
      done = true;
      return withLeadingComments(n, d);
    }
    return n;
  });
};
