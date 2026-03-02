// Helper function that maps a string-based size prop to width/height CSS via lookup
// The helper is non-trivial: it uses a map + conditional logic, so the codemod cannot simply inline it
import styled from "styled-components";

type AvatarSize = "small" | "medium" | "large";

const sizeMap: Record<AvatarSize, number> = {
  small: 20,
  medium: 24,
  large: 32,
};

function avatarSizeToCSS(size: AvatarSize) {
  const px = sizeMap[size];
  return `width: ${px}px; height: ${px}px;`;
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
    <AvatarContainer size="small">
      <div
        style={{
          background: "#bf4f74",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "10px",
        }}
      >
        S
      </div>
    </AvatarContainer>
    <AvatarContainer size="medium">
      <div
        style={{
          background: "#4f74bf",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "10px",
        }}
      >
        M
      </div>
    </AvatarContainer>
    <AvatarContainer size="large">
      <div
        style={{
          background: "#22c55e",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "10px",
        }}
      >
        L
      </div>
    </AvatarContainer>
    <AvatarContainer size="medium" disabled>
      <div
        style={{
          background: "#666",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "10px",
        }}
      >
        Md
      </div>
    </AvatarContainer>
  </div>
);
