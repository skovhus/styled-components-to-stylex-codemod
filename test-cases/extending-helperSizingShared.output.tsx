import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type AvatarSize = 16 | 20 | 24 | 28 | 32;

export function avatarSizeToCSS(size: AvatarSize) {
  return `width: ${size}px; height: ${size}px;`;
}

type AvatarContainerProps = React.PropsWithChildren<{
  size: AvatarSize;
}>;

function AvatarContainer(props: AvatarContainerProps) {
  const { children, size } = props;

  return (
    <div
      sx={[
        styles.avatarContainer,
        styles.avatarContainerWidth({
          size: size,
        }),
        styles.avatarContainerHeight({
          size: size,
        }),
      ]}
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
  avatarContainerWidth: (props: { size: AvatarSize }) => ({
    width: `${props.size}px`,
  }),
  avatarContainerHeight: (props: { size: AvatarSize }) => ({
    height: `${props.size}px`,
  }),
});
