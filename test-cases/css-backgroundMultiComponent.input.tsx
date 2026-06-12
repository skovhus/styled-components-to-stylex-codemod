// Multi-component background shorthands expand to their StyleX longhands
// (backgroundColor/backgroundImage/backgroundRepeat/backgroundPosition/backgroundSize).
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

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Banner>Background shorthand</Banner>
    <Tile>Tile shorthand</Tile>
  </div>
);
