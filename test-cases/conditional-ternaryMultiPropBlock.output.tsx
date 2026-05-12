// Ternary that returns multi-line CSS blocks (multiple declarations per branch).
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

const Text = (
  props: React.ComponentProps<"span"> & {
    column?: boolean;
    color?: "base" | "muted";
    gap?: number;
    variant?: "small" | "medium";
  },
) => {
  const { column, color, gap, variant, ...rest } = props;
  return (
    <span data-column={column} data-color={color} data-gap={gap} data-variant={variant} {...rest} />
  );
};

type ErrorMessageProps = { inline?: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style"
>;

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

type StyledTextProps = {
  addBottomBorder?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">;

function StyledText(props: StyledTextProps) {
  const { children, addBottomBorder, hasSubtitle, ...rest } = props;
  return (
    <Text
      {...rest}
      gap={16}
      column={true}
      {...stylex.props(
        styles.text,
        addBottomBorder && styles.textAddBottomBorder,
        addBottomBorder && hasSubtitle && styles.textAddBottomBorderHasSubtitle,
        addBottomBorder && !hasSubtitle && styles.textAddBottomBorderNotHasSubtitle,
      )}
    >
      {children}
    </Text>
  );
}

export const App = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: "16px",
      position: "relative",
    }}
  >
    <ErrorMessage inline>Inline error</ErrorMessage>
    <ErrorMessage inline={false}>Block error</ErrorMessage>
    <StyledText variant="small" color="muted" hasSubtitle={false}>
      No bottom border
    </StyledText>
    <StyledText variant="small" color="muted" addBottomBorder hasSubtitle>
      Border with subtitle
    </StyledText>
    <StyledText variant="small" color="muted" addBottomBorder hasSubtitle={false}>
      Border without subtitle
    </StyledText>
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
  text: {
    marginBottom: 8,
  },
  textAddBottomBorderHasSubtitle: {
    paddingBottom: 20,
  },
  textAddBottomBorderNotHasSubtitle: {
    paddingBottom: 40,
  },
  textAddBottomBorder: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgBorderSolid,
  },
});
