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
        /(\n\s*\},)\n\n+(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
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

  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}
