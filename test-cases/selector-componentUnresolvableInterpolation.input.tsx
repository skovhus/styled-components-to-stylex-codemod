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

// Static declarations after an unresolvable interpolation must be preserved
const Tag = styled.span<{ $highlighted?: boolean }>`
  font-size: 12px;

  ${Link}:hover & {
    color: ${(props) => (props.$highlighted ? "blue" : "inherit")};
    font-weight: 700;
  }
`;

// Shorthand border with interpolation: static longhands (width, style) must stay static
const Card = styled.div<{ $accent?: boolean }>`
  padding: 8px;

  ${Link}:hover & {
    border: 2px solid ${(props) => (props.$accent ? "red" : "transparent")};
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
    <Link href="#">
      <Tag $highlighted>Highlighted</Tag>
    </Link>
    <Link href="#">
      <Tag>Normal</Tag>
    </Link>
    <Link href="#">
      <Card $accent>Accent Card</Card>
    </Link>
    <Link href="#">
      <Card>Default Card</Card>
    </Link>
  </div>
);
