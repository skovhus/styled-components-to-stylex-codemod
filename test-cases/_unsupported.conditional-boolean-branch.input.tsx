import styled from "styled-components";

const Button = styled.button`
  cursor: ${(props) => (props.disabled ? "not-allowed" : false)};
`;

export const App = () => <Button disabled={false}>Click</Button>;
