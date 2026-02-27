import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type AvatarSize = 16 | 20 | 24 | 28 | 32;

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
        styles.avatarContainerWidth(size),
        styles.avatarContainerHeight(size),
      )}
    >
      {children}
    </div>
  );
}

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
  avatarContainerWidth: (size: AvatarSize) => ({
    width: `${size}px`,
  }),
  avatarContainerHeight: (size: AvatarSize) => ({
    height: `${size}px`,
  }),
});
