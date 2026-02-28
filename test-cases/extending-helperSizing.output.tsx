import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type AvatarSize = "small" | "medium" | "large";

const sizeMap: Record<AvatarSize, number> = {
  small: 20,
  medium: 24,
  large: 32,
};

type AvatarContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size: AvatarSize;
  disabled?: boolean;
};

function AvatarContainer(props: AvatarContainerProps) {
  const { children, disabled, size } = props;

  return (
    <div
      {...stylex.props(
        styles.avatarContainer,
        disabled ? styles.avatarContainerDisabled : undefined,
        styles.avatarContainerWidth(sizeMap[size]),
        styles.avatarContainerHeight(sizeMap[size]),
      )}
    >
      {children}
    </div>
  );
}

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

const styles = stylex.create({
  avatarContainer: {
    display: "flex",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 0,
    flexShrink: 0,
    aspectRatio: "1/1",
  },
  avatarContainerDisabled: {
    opacity: 0.5,
  },
  avatarContainerWidth: (width: number) => ({
    width,
  }),
  avatarContainerHeight: (height: number) => ({
    height,
  }),
});
