// Transient prop rename with shared type across components where one has call-site spread
import styled from "styled-components";

type SharedProps = {
  $highlight?: boolean;
};

export const CardA = styled.div<SharedProps>`
  padding: 8px;
  background-color: ${(props) => (props.$highlight ? "yellow" : "white")};
`;

export const CardB = styled.div<SharedProps>`
  padding: 8px;
  background-color: ${(props) => (props.$highlight ? "yellow" : "white")};
`;

// Non-styled wrapper with spread — causes CardB's rename to be skipped
function CardBInner(props: React.ComponentProps<typeof CardB>) {
  return <CardB {...props} />;
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 8, padding: 16 }}>
      <CardA $highlight>A Highlighted</CardA>
      <CardA>A Default</CardA>
      <CardB $highlight>B Highlighted</CardB>
      <CardB>B Default</CardB>
    </div>
  );
}
