import { splitCssValueWhitespace } from "./css-value-split.js";

type BorderRadiusLonghands = {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
};

export function expandBorderRadiusShorthandValue(value: string): BorderRadiusLonghands | null {
  if (value.includes("/")) {
    return null;
  }
  const parts = splitCssValueWhitespace(value.trim());
  if (parts.length <= 1 || parts.length > 4) {
    return null;
  }
  const topLeft = parts[0];
  if (topLeft === undefined) {
    return null;
  }
  const topRight = parts[1] ?? topLeft;
  const bottomRight = parts[2] ?? topLeft;
  const bottomLeft = parts[3] ?? topRight;
  return { topLeft, topRight, bottomRight, bottomLeft };
}
