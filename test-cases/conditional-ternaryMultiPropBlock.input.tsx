// Ternary that returns multi-line CSS blocks (multiple declarations per branch).
import styled from "styled-components";

const ErrorMessage = styled.div<{ $inline?: boolean }>`
  color: red;
  font-size: 12px;
  ${(props) =>
    props.$inline === true
      ? `padding: 0 6px;
         border-radius: 4px;
         position: absolute;
         right: 4px;
         top: 4px;`
      : `margin-top: 8px;
         padding: 4px 0;
         border-top: 1px solid red;`}
`;

export const App = () => (
  <div style={{ padding: "16px", position: "relative" }}>
    <ErrorMessage $inline>Inline error</ErrorMessage>
    <ErrorMessage $inline={false}>Block error</ErrorMessage>
  </div>
);
