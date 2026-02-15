import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
  color: #bf4f74;
`;

// Two interpolation slots in a single declaration value.
// Both must resolve independently to their respective theme tokens.
const Badge = styled.span`
  padding: 4px 8px;

  ${Link}:hover & {
    box-shadow: 0 4px 8px ${(props) => props.theme.color.labelBase};
    border: 2px solid ${(props) => props.theme.color.bgSub};
  }
`;

export const App = () => (
  <Link href="#">
    <Badge>Label</Badge>
    Hover me
  </Link>
);
