// @expected-warning: Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand
import styled from "styled-components";

// A background shorthand with both color and image components cannot be emitted
// as only backgroundColor or backgroundImage without dropping reset semantics.
const Banner = styled.div`
  background: #f7f7ff url("/asset.svg") no-repeat center / cover;
  color: #111;
  padding: 16px;
`;

export const App = () => <Banner>Background shorthand</Banner>;
