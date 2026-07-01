const STYLEX_CREATE_MARKER = "stylex.create({";

function findStylexCreateBlockEnd(code: string, blockStart: number): number {
  let depth = 1;
  let blockEnd = blockStart;
  let inString: string | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = blockStart; i < code.length && depth > 0; i++) {
    const ch = code[i];
    const next = code[i + 1];

    // Comments are skipped so quotes/braces inside them (e.g. an apostrophe in
    // `base's`, or `${Foo}` in a selector note) don't derail string/brace tracking.
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        blockEnd = i;
      }
    }
  }

  return blockEnd;
}

function transformStylexCreateBlocks(
  code: string,
  transformBlock: (blockContent: string) => string,
): string {
  let result = "";
  let pos = 0;

  while (pos < code.length) {
    const markerIdx = code.indexOf(STYLEX_CREATE_MARKER, pos);
    if (markerIdx === -1) {
      result += code.slice(pos);
      break;
    }

    result += code.slice(pos, markerIdx);
    const blockStart = markerIdx + STYLEX_CREATE_MARKER.length;
    const blockEnd = findStylexCreateBlockEnd(code, blockStart);
    const blockContent = code.slice(markerIdx, blockEnd + 1);
    result += transformBlock(blockContent);
    pos = blockEnd + 1;
  }

  return result;
}

/**
 * Remove blank lines inside stylex.create({...}) blocks.
 * Finds each `stylex.create({` and tracks brace depth to the matching `})`,
 * then drops every blank line within that region so style entries stay adjacent.
 * Blank lines inside multiline template-literal values are preserved, since they
 * are part of the CSS value and removing them would not be lossless.
 */
function removeBlankLinesInStylexCreate(code: string): string {
  return transformStylexCreateBlocks(code, (blockContent) => {
    const lines = blockContent.split("\n");
    const kept: string[] = [];
    let inTemplate = false;
    for (const line of lines) {
      if (!inTemplate && line.trim() === "") {
        continue;
      }
      kept.push(line);
      if (countUnescapedBackticks(line) % 2 === 1) {
        inTemplate = !inTemplate;
      }
    }
    return (
      kept
        .join("\n")
        // Normalize `content` strings: prefer `'\"...\"'` form over escaped double-quotes
        .replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'")
        .replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'")
    );
  });
}

/** Counts backtick characters on a line that are not backslash-escaped. */
function countUnescapedBackticks(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "`" && (i === 0 || line[i - 1] !== "\\")) {
      count++;
    }
  }
  return count;
}

/**
 * Indents lines inside multiline template literal object values so each continuation
 * line is two spaces deeper than the property line that opens the template.
 */
export function indentMultilineTemplateLiterals(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const openerMatch = line.match(/^(\s+).+:\s*`$/);
    if (!openerMatch) {
      result.push(line);
      continue;
    }

    const continuationIndent = `${openerMatch[1]}  `;
    result.push(line);
    i++;

    while (i < lines.length) {
      const innerLine = lines[i] ?? "";
      const closeIdx = innerLine.lastIndexOf("`");
      if (closeIdx === -1) {
        result.push(continuationIndent + innerLine.trimStart());
        i++;
        continue;
      }

      const content = innerLine.slice(0, closeIdx).trimStart();
      const afterBacktick = innerLine.slice(closeIdx);
      result.push(continuationIndent + content + afterBacktick);
      break;
    }
  }

  return result.join("\n");
}

/** Applies multiline template literal indentation only inside `stylex.create({...})` blocks. */
function indentMultilineTemplateLiteralsInStylexCreate(code: string): string {
  return transformStylexCreateBlocks(code, indentMultilineTemplateLiterals);
}

export function formatOutput(code: string): string {
  // Normalize stylex.create blocks (targeted, defensive approach)
  let out = removeBlankLinesInStylexCreate(code);

  // Normalize import spacing at the top of the file:
  // - Keep React and StyleX imports adjacent (no blank line between them).
  // - Ensure a blank line after the final top-level import.
  out = (() => {
    const lines = out.split("\n");
    const isImportLine = (line: string) => line.startsWith("import ");
    const isBlankLine = (line: string) => line.trim() === "";
    const isReactImport = (line: string) =>
      /^import\s+.*\s+from\s+["']react["'];?$/.test(line.trim());
    const isStylexImport = (line: string) =>
      /^import\s+.*\s+from\s+["']@stylexjs\/stylex["'];?$/.test(line.trim());

    // Find the top import block (allowing blank lines between imports).
    let importStart = -1;
    let importEnd = -1;
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      if (isImportLine(line)) {
        importStart = i;
        importEnd = i;
        i++;
        break;
      }
      if (
        trimmed === "" ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*")
      ) {
        continue;
      }
      break;
    }

    if (importStart >= 0) {
      for (; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (isImportLine(line)) {
          importEnd = i;
          continue;
        }
        if (isBlankLine(line)) {
          continue;
        }
        break;
      }

      // Remove blank lines between React and StyleX imports.
      for (let idx = importStart; idx <= importEnd; idx++) {
        if (!isReactImport(lines[idx] ?? "")) {
          continue;
        }
        let nextIdx = idx + 1;
        while (nextIdx <= importEnd && isBlankLine(lines[nextIdx] ?? "")) {
          nextIdx++;
        }
        if (nextIdx <= importEnd && isStylexImport(lines[nextIdx] ?? "")) {
          const blanksToRemove = nextIdx - idx - 1;
          if (blanksToRemove > 0) {
            lines.splice(idx + 1, blanksToRemove);
            importEnd -= blanksToRemove;
          }
        }
        break;
      }

      // Ensure a blank line after the last import line in the block.
      const next = lines[importEnd + 1];
      if (next !== undefined && next.trim() !== "") {
        lines.splice(importEnd + 1, 0, "");
      }
    }

    return lines.join("\n");
  })();

  // Remove blank line between props destructure and the next statement.
  // recast inserts a blank line after `const { ... } = props;` inside function bodies.
  // Anchored to statement-level lines (leading whitespace + `const`) to avoid
  // matching inside string/template literals or comments.
  out = out.replace(/(^\s+const\s+\{[^}]*\} = props;\n)\n(\s+)/gm, "$1$2");

  out = indentMultilineTemplateLiteralsInStylexCreate(out);

  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}
