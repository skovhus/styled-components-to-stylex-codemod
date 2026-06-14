// Multi-component background shorthands expand to every StyleX longhand, with
// omitted components reset to their initial value so the shorthand's reset
// semantics survive merging (e.g. an extended base's background-color).
import styled from "styled-components";

const Banner = styled.div`
  background: #f7f7ff url("/asset.svg") no-repeat center / cover;
  color: #111;
  padding: 16px;
`;

const Tile = styled.div`
  background: peachpuff repeat-x fixed left top;
  padding: 16px;
`;

const ColoredBase = styled.div`
  background-color: blue;
  padding: 16px;
`;

// The shorthand omits a color component, so the base's blue must reset to
// transparent rather than leak through the merged StyleX styles.
const Overlay = styled(ColoredBase)`
  background: url("/asset.svg") no-repeat center / cover;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Banner>Background shorthand</Banner>
    <Tile>Tile shorthand</Tile>
    <Overlay>Overlay reset</Overlay>
  </div>
);
