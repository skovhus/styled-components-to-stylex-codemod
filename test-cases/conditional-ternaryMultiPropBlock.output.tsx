import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ErrorMessageProps = React.PropsWithChildren<{
  $inline?: boolean;
}>;

function ErrorMessage(props: ErrorMessageProps) {
  const { children, $inline, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.errorMessage,
        $inline === true ? styles.errorMessageInline : styles.errorMessageNotInline,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ padding: "16px", position: "relative" }}>
    <ErrorMessage $inline>Inline error</ErrorMessage>
    <ErrorMessage $inline={false}>Block error</ErrorMessage>
  </div>
);

const styles = stylex.create({
  errorMessage: {
    color: "red",
    fontSize: "12px",
  },
  errorMessageInline: {
    paddingBlock: 0,
    paddingInline: "6px",
    borderRadius: "4px",
    position: "absolute",
    right: "4px",
    top: "4px",
  },
  errorMessageNotInline: {
    marginTop: "8px",
    paddingBlock: "4px",
    paddingInline: 0,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "red",
  },
});
