import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ErrorMessageProps = React.PropsWithChildren<{
  inline?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}>;

function ErrorMessage(props: ErrorMessageProps) {
  const { children, inline, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.errorMessage,
        inline === true ? styles.errorMessageInline : styles.errorMessageNotInline,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ padding: "16px", position: "relative" }}>
    <ErrorMessage inline>Inline error</ErrorMessage>
    <ErrorMessage inline={false}>Block error</ErrorMessage>
  </div>
);

const styles = stylex.create({
  errorMessage: {
    color: "red",
    fontSize: 12,
  },
  errorMessageInline: {
    paddingBlock: 0,
    paddingInline: 6,
    borderRadius: 4,
    position: "absolute",
    right: 4,
    top: 4,
  },
  errorMessageNotInline: {
    marginTop: 8,
    paddingBlock: 4,
    paddingInline: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "red",
  },
});
