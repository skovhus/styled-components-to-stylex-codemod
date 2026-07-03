// @expected-warning: Unsupported interpolation: identifier
// A module-level theme arrow function referenced as a bare interpolation value:
//   const baseColor = (props) => props.theme.isDark ? A : B;
//   styled.div`border: 1px solid ${baseColor}; color: ${baseColor};`
// StyleX cannot emit a function object as a CSS value, so the codemod must bail on
// these declarations rather than inline `borderColor: baseColor` (invalid output —
// it would compile the identifier's toString()). Ideally this resolves to two
// useTheme().isDark variants (as the equivalent INLINE arrow form already does in
// `useTheme-isDark`), but dereferencing a named function const is not yet built.
import styled, { type DefaultTheme } from "styled-components";

const baseColor = (props: { theme: DefaultTheme }) =>
  props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBorderFaint;

// An unrelated binding that SHADOWS the module-scope `baseColor` name in a nested
// scope. The bail must still fire for the module-scope reference in the styled
// template below — the shadowing must NOT drop `baseColor` from the bail set.
function readColor({ baseColor }: { baseColor: string }) {
  return baseColor;
}

const Badge = styled.div`
  border: 1px solid ${baseColor};
  color: ${baseColor};
  padding: 8px;
`;

export const App = () => (
  <>
    <Badge>Badge</Badge>
    {readColor({ baseColor: "labelBase" })}
  </>
);
