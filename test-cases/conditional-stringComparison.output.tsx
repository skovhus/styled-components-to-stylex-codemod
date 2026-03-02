import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;

type StyledIconButtonProps = { useRoundStyle?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof IconButton>,
  "className" | "style"
>;

function StyledIconButton(props: StyledIconButtonProps) {
  const { children, useRoundStyle, ...rest } = props;

  return (
    <IconButton
      {...rest}
      {...stylex.props(
        styles.iconButton,
        useRoundStyle !== false && styles.iconButtonUseRoundStyle,
      )}
    >
      {children}
    </IconButton>
  );
}

export const App = () => <StyledIconButton>Icon</StyledIconButton>;

const styles = stylex.create({
  iconButton: {
    padding: "4px",
  },
  iconButtonUseRoundStyle: {
    borderRadius: "100%",
  },
});
