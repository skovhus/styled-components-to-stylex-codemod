// Cross-component sibling combinator: ${Link}:focus-visible + &
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

  @media (min-width: 768px) {
    ${Link}:hover + & {
      background: lightyellow;
    }
  }
`;

export const App = () => (
  <div>
    <Link href="#">Link</Link>
    <Badge>Badge (blue when Link is focused, lightyellow bg on hover at 768px+)</Badge>
  </div>
);
