// Generated styled-components useTheme imports must not collide with an existing app useTheme import.
import styled from "styled-components";
import { useTheme } from "./lib/app-theme";

const RuntimeThemeBox = styled.div`
  color: ${(props) => props.theme.baseTheme?.color.bgBorderSolid ?? "#94a3b8"};
  background: #f8fafc;
  padding: 8px;
`;

export const App = () => {
  const appTheme = useTheme();
  return <RuntimeThemeBox>{appTheme.name}</RuntimeThemeBox>;
};
