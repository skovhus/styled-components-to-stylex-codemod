// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

// ${Link}:focus-visible + & uses a sibling combinator between the
// component and self. This is NOT an ancestor relationship, so
// stylex.when.ancestor() would produce incorrect semantics.
const Badge = styled.span`
  padding: 4px 8px;
  color: gray;

  ${Link}:focus-visible + & {
    color: blue;
  }
`;

export const App = () => (
  <div>
    <Link href="#">Link</Link>
    <Badge>Badge (blue when Link is focused, adjacent sibling)</Badge>
  </div>
);
