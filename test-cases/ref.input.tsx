import styled from "styled-components";
import { useRef, useEffect } from "react";

const Input = styled.input`
  padding: 0.5em;
  margin: 0.5em;
  color: #BF4F74;
  background: papayawhip;
  border: none;
  border-radius: 3px;
`;

export const App = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <Input ref={inputRef} placeholder="Focus me on mount!" />;
};
