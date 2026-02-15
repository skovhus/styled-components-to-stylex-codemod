import styled from "styled-components";

const Link = styled.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #bf4f74;
`;

// Reverse component selector with interpolated theme value
const Badge = styled.span`
  padding: 4px 8px;
  background: ${(props) => props.theme.color.bgSub};

  ${Link}:focus-visible & {
    outline: 2px solid ${(props) => props.theme.color.labelBase};
  }
`;

export const App = () => (
  <Link href="#">
    <Badge>Label</Badge>
    Hover me
  </Link>
);
