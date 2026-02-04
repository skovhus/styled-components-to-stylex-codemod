import React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { $colors } from "./tokens.stylex";

// Using CSS snippet helper for truncation
function TruncatedText(
  props: React.PropsWithChildren<{
    ref?: React.Ref<HTMLParagraphElement>;
  }>,
) {
  const { children } = props;

  return <p {...stylex.props(styles.truncatedText, helpers.truncate)}>{children}</p>;
}

// Using CSS snippet helper for flex centering
function CenteredContainer(
  props: React.PropsWithChildren<{
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { children } = props;

  return <div {...stylex.props(styles.centeredContainer, helpers.flexCenter)}>{children}</div>;
}

function CardTitle(
  props: React.PropsWithChildren<{
    ref?: React.Ref<HTMLHeadingElement>;
  }>,
) {
  const { children } = props;

  return <h3 {...stylex.props(styles.cardTitle, helpers.truncate)}>{children}</h3>;
}

export const App = () => (
  <CenteredContainer>
    <div {...stylex.props(styles.card)}>
      <CardTitle>This is a very long title that should be truncated</CardTitle>
      <TruncatedText>
        This is some text content that will be truncated if it gets too long.
      </TruncatedText>
      <button {...stylex.props(styles.button)}>Click me</button>
    </div>
  </CenteredContainer>
);

const styles = stylex.create({
  // Using theme accessor helper
  button: {
    paddingBlock: "0.5em",
    paddingInline: "1em",
    backgroundColor: {
      default: $colors.primaryColor,
      ":hover": $colors.bgSub,
    },
    color: $colors.textPrimary,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    borderRadius: "4px",
    cursor: "pointer",
  },
  truncatedText: {
    maxWidth: "200px",
    fontSize: "14px",
    color: $colors.textSecondary,
  },
  centeredContainer: {
    minHeight: "100px",
    backgroundColor: $colors.bgBase,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
  },
  // Combining multiple helpers
  card: {
    padding: "1em",
    backgroundColor: $colors.bgBase,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    borderRadius: "8px",
  },
  cardTitle: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: "0.5em",
    marginLeft: 0,
    color: $colors.primaryColor,
    fontSize: "18px",
  },
});
