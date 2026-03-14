// Reverse component selector with prop-based interpolation (non-theme dynamic value)
import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

const Badge = styled.span<{ $active?: boolean }>`
  padding: 4px 8px;

  ${Link}:hover & {
    color: ${(props) => (props.$active ? "green" : "gray")};
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Link href="#">
      <Badge $active>Active</Badge>
    </Link>
    <Link href="#">
      <Badge>Inactive</Badge>
    </Link>
  </div>
);
