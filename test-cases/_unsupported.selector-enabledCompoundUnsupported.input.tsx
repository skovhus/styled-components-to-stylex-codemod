// @expected-warning: Unsupported selector: compound pseudo selector
// :enabled only normalizes safely for intrinsic form controls. Non-form elements and
// custom component roots should keep bailing instead of emitting an unproven selector.
import styled from "styled-components";

const Base = (props: React.ComponentProps<"button">) => <button {...props} />;

const NonFormBox = styled.div`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

const WrappedButton = styled(Base)`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <NonFormBox>Non-form box</NonFormBox>
    <WrappedButton type="button">Wrapped button</WrappedButton>
  </div>
);
