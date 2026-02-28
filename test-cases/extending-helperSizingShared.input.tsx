// Local helper used in styled template AND also exported for external use
import styled from "styled-components";

type AvatarSize = 16 | 20 | 24 | 28 | 32;

export function avatarSizeToCSS(size: AvatarSize) {
  return `width: ${size}px; height: ${size}px;`;
}

const AvatarContainer = styled.div<{ size: AvatarSize }>`
  display: flex;
  align-items: center;
  ${(props) => avatarSizeToCSS(props.size)}
`;

export const App = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <AvatarContainer size={16}>16</AvatarContainer>
    <AvatarContainer size={24}>24</AvatarContainer>
  </div>
);
