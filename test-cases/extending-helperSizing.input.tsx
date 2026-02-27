// Helper function that maps a prop to width/height CSS — local helper, not imported
import styled from "styled-components";

type AvatarSize = 16 | 20 | 24 | 28 | 32;

function avatarSizeToCSS(size: AvatarSize) {
  return `width: ${size}px; height: ${size}px;`;
}

const AvatarContainer = styled.div<{ size: AvatarSize; disabled?: boolean }>`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  ${(props) => (props.disabled ? "opacity: 0.5;" : "")};
  ${(props) => avatarSizeToCSS(props.size)}
`;

export const App = () => (
  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
    <AvatarContainer size={16}>16</AvatarContainer>
    <AvatarContainer size={24}>24</AvatarContainer>
    <AvatarContainer size={32}>32</AvatarContainer>
    <AvatarContainer size={20} disabled>
      20d
    </AvatarContainer>
  </div>
);
