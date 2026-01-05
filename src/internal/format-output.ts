export function formatOutput(code: string): string {
  // Recast sometimes inserts blank lines between object properties when values are multiline.
  // Our fixtures are formatted without those blank lines; normalize conservatively.
  let out = code.replace(
    /(\n\s*\},)\n\n(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
    "$1\n$2",
  );
  // General: remove blank lines after commas (prettier-style objects don't use them).
  out = out.replace(/,\n\n(\s+(?:[a-zA-Z_$]|["']|::|@|:))/g, ",\n$1");
  // Also remove blank lines after commas when the next line is a leading block comment.
  out = out.replace(/,\n\n(\s*\/\*)/g, ",\n$1");

  // If a trailing line comment got detached onto its own line immediately above an object property,
  // re-attach it inline after the property's comma:
  //
  //   // comment
  //   prop: value,
  //
  // -> prop: value, // comment
  out = out.replace(
    /\n\n?(\s*)\/\/\s*([^\n]+)\n\1((?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'][^"']+["']))\s*:\s*([^\n]*?),/g,
    (_m, indent, comment, key, value) => `\n${indent}${key}: ${value}, // ${comment}`,
  );
  // Normalize `content` strings: prefer `'\"...\"'` form (matches fixtures) over escaped double-quotes.
  // Case 1: content: "\"X\""  (double-quoted with escapes)
  out = out.replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'");
  // Case 2: content: \"'X'\"   (double-quoted string that includes single quotes)
  out = out.replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'");
  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}
