// @expected-warning: Unsupported interpolation: helper call receives full styled-components props object
// Theme-dependent helpers that receive the full styled-components props object cannot be preserved
// in StyleX dynamic style functions because the generated component props do not include theme.
//
// This is a codemod safety bail-out, not a known StyleX compiler bug. The helper is invoked with
// the entire styled-components props object, so the callee can read arbitrary props and theme data.
// The codemod can preserve direct theme/token reads through the adapter, but it cannot safely
// synthesize an equivalent StyleX dynamic style function for an opaque helper that expects the
// original themed props object.
import styled from "styled-components";

function themeShadow(_level: "high") {
  return (props: { theme: { color: { bgBase: string } } }) =>
    `0 8px 24px ${props.theme.color.bgBase}`;
}

const Panel = styled.div`
  padding: 16px;
  box-shadow: ${(props) => themeShadow("high")(props)};
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Panel>Theme helper props call</Panel>
  </div>
);
