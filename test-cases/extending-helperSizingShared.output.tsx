import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type AvatarSize = 16 | 20 | 24 | 28 | 32;

export function avatarSizeToCSS(size: AvatarSize) {
  return `width: ${size}px; height: ${size}px;`;
}

type AvatarContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size: AvatarSize;
};

function AvatarContainer(props: AvatarContainerProps) {
  const { children, size } = props;

  return (
    <div
      {...stylex.props(
        styles.avatarContainer,
        styles.avatarContainerWidth(size),
        styles.avatarContainerHeight(size),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <AvatarContainer size={16}>16</AvatarContainer>
    <AvatarContainer size={24}>24</AvatarContainer>
  </div>
);

const styles = stylex.create({
  avatarContainer: {
    display: "flex",
    alignItems: "center",
  },
  avatarContainerWidth: (size: AvatarSize) => ({
    width: `${size}px`,
  }),
  avatarContainerHeight: (size: AvatarSize) => ({
    height: `${size}px`,
  }),
});
