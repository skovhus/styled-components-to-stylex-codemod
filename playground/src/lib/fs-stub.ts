// Stub for node:fs in browser environment
// The transform uses these for reading static properties from imports,
// which gracefully degrades when files can't be read.

export function readFileSync(): string {
  return "";
}

export function existsSync(): boolean {
  return false;
}

export default {
  readFileSync,
  existsSync,
};
