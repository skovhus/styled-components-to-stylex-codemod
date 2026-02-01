import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;

type StyledIconButtonProps = Omit<
  React.ComponentPropsWithRef<typeof IconButton>,
  "style" | "className"
> & {
  useRoundStyle?: boolean;
};

function StyledIconButton(props: StyledIconButtonProps) {
  const { children, useRoundStyle, ...rest } = props;
  return (
    <IconButton
      {...rest}
      {...stylex.props(
        styles.iconButton,
        useRoundStyle !== false && styles.iconButtonUseRoundStyleNotFalse,
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
  iconButtonUseRoundStyleNotFalse: {
    borderRadius: "100%",
  },
});
