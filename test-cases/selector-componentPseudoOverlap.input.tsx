import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

// The child has a base :focus pseudo on color, AND a reverse ancestor override on color.
// The default in the override must be the scalar base value, not the pseudo map object.
const Badge = styled.span`
  padding: 4px 8px;
  color: gray;

  &:focus {
    color: orange;
  }

  ${Link}:hover & {
    color: blue;
  }
`;

export const App = () => (
  <Link href="#">
    <Badge>Label (gray, orange on focus, blue on Link hover)</Badge>
  </Link>
);
