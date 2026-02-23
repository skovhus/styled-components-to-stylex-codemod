import styled from "styled-components";

/**
 * A div with the `contain: paint` CSS property, indicating that children do not paint outside of this element's bounds.
 * This can improve performance, and also fix painting bugs in some browsers.
 */
export const ContainPaint = styled.div`
  contain: paint;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <ContainPaint>Contained</ContainPaint>
  </div>
);
