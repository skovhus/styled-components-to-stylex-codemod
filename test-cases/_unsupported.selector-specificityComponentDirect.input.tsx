// @expected-warning: Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX
import * as React from "react";
import styled from "styled-components";

function BaseButton(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

const EmphasizedButton = styled(BaseButton)`
  color: #1f2937;

  &&:hover {
    color: #dc2626;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <EmphasizedButton>Hover action</EmphasizedButton>
  </div>
);
