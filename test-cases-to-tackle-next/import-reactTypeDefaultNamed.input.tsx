// React type imports must not be merged into invalid default-plus-named type import syntax.
import type React from "react";
import type { CSSProperties } from "react";
import styled from "styled-components";

type MessageProps = {
  children?: React.ReactNode;
  style?: CSSProperties;
};

const Message = styled.div<MessageProps>`
  padding: 8px;
  background: #dcfce7;
`;

export const App = () => <Message style={{ color: "#166534" }}>Typed message</Message>;
