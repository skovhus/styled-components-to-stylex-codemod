import type { ASTNode, Comment } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";

type CommentableNode = ASTNode & { leadingComments?: Comment[]; comments?: Comment[] };

const getWrapperLeadingComments = (d: StyledDecl): Comment[] | null => {
  const cs = (d as { leadingComments?: Comment[] }).leadingComments;
  if (!Array.isArray(cs) || cs.length === 0) {
    return null;
  }

  return cs;
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
