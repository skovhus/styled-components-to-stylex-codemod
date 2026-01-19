type HexColor = `#${string}`;

function hexToRgba(hex: HexColor, alpha: number): string {
  const raw = hex.slice(1);
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (normalized.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const ColorConverter = {
  cssWithAlpha(color: string, alpha: number): string {
    if (!color.startsWith("#")) {
      return color;
    }
    return hexToRgba(color as HexColor, alpha);
  },
};
