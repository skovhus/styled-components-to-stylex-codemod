/**
 * Remove blank lines inside stylex.create({...}) blocks.
 * Finds each `stylex.create({` and tracks brace depth to the matching `})`,
 * then removes blank lines between properties within that region.
 */
function removeBlankLinesInStylexCreate(code: string): string {
  const marker = "stylex.create({";
  let result = "";
  let pos = 0;

  while (pos < code.length) {
    const markerIdx = code.indexOf(marker, pos);
    if (markerIdx === -1) {
      result += code.slice(pos);
      break;
    }

    // Copy everything before the marker
    result += code.slice(pos, markerIdx);

    // Find the matching closing brace by tracking depth
    const blockStart = markerIdx + marker.length;
    let depth = 1;
    let blockEnd = blockStart;
    let inString: string | null = null;
    let escaped = false;

    for (let i = blockStart; i < code.length && depth > 0; i++) {
      const ch = code[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (inString) {
        if (ch === inString) {
          inString = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          blockEnd = i;
        }
      }
    }

    // Extract the block content and normalize it
    const blockContent = code.slice(markerIdx, blockEnd + 1);
    const cleaned = blockContent
      // Remove blank lines after closing braces followed by property
      .replace(
        /(\n\s*\},)\n\n+(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|\d+|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
        "$1\n$2",
      )
      // Remove blank lines after commas followed by property or comment
      .replace(/,\n\n+(\s+(?:[a-zA-Z_$"']|\/\/|\/\*))/g, ",\n$1")
      // Normalize `content` strings: prefer `'\"...\"'` form over escaped double-quotes
      .replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'")
      .replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'");

    result += cleaned;
    pos = blockEnd + 1;
  }

  return result;
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
  // We use a line-based approach to avoid matching inside string/template literals.
  out = removeBlankLineAfterPropsDestructure(out);

  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}

/**
 * Remove blank lines after `} = props;` destructuring statements in function bodies.
 * Uses line-by-line analysis to avoid modifying matching patterns inside
 * string/template literals or comments.
 */
function removeBlankLineAfterPropsDestructure(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];
  let inString = false;
  let stringChar = "";
  let inBlockComment = false;
  let inTemplateLiteral = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Track whether we're inside a multi-line string/comment context.
    // If so, just pass the line through unchanged.
    if (inBlockComment) {
      result.push(line);
      if (line.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }
    if (inTemplateLiteral) {
      result.push(line);
      // Count unescaped backticks to detect end of template literal
      for (let c = 0; c < line.length; c++) {
        if (line[c] === "\\") {
          c++; // skip escaped char
        } else if (line[c] === "`") {
          inTemplateLiteral = false;
        }
      }
      continue;
    }
    if (inString) {
      result.push(line);
      // Multi-line strings (only template literals can truly span lines,
      // but handle edge cases)
      if (line.includes(stringChar)) {
        inString = false;
      }
      continue;
    }

    // Check if this line ends with `} = props;` (the destructuring pattern)
    // and the next line is blank — if so, skip the blank line.
    const trimmed = line.trimEnd();
    if (
      trimmed.endsWith("} = props;") &&
      i + 1 < lines.length &&
      (lines[i + 1] ?? "").trim() === ""
    ) {
      result.push(line);
      i++; // skip the blank line
      continue;
    }

    result.push(line);

    // Update string/comment tracking for subsequent lines
    // Simple heuristic: scan the line for unmatched quotes/comments
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "/" && line[c + 1] === "/") {
        break; // rest of line is a comment
      }
      if (ch === "/" && line[c + 1] === "*") {
        if (!line.includes("*/", c + 2)) {
          inBlockComment = true;
        }
        break;
      }
      if (ch === "\\") {
        c++; // skip escaped char
        continue;
      }
      if (ch === "`") {
        inTemplateLiteral = true;
        // Check if it closes on the same line
        for (let j = c + 1; j < line.length; j++) {
          if (line[j] === "\\") {
            j++;
          } else if (line[j] === "`") {
            inTemplateLiteral = false;
            c = j;
            break;
          }
        }
        if (inTemplateLiteral) {
          break;
        }
      }
    }
  }

  return result.join("\n");
}
