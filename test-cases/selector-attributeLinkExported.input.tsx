// Exported link component with attribute selectors triggers allowClassNameProp/allowStyleProp paths
import styled from "styled-components";

export const Link = styled.a`
  color: #bf4f74;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &[target="_blank"]::after {
    content: " ↗";
    font-size: 0.8em;
  }

  &[href^="https"] {
    color: #4caf50;
  }

  &[href$=".pdf"] {
    color: #f44336;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Link href="/page">Internal</Link>
      <Link href="https://example.com" target="_blank">
        External HTTPS
      </Link>
      <Link href="/doc.pdf">PDF Link</Link>
    </div>
  );
}
