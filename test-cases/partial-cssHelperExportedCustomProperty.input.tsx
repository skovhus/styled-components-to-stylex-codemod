// Exported css helper with local custom properties should not emit dead StyleX sidecars.
import styled, { css } from "styled-components";

export const attributionStyles = css`
  --attribution-color: #bf4f74;
  color: var(--attribution-color);
`;

const Panel = styled.div`
  padding: 8px;
  background-color: #eef8ff;
`;

export const App = () => <Panel>Panel</Panel>;
