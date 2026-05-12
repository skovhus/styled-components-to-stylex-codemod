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

type OrderedBoxProps = {
  add?: boolean;
  warn?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function OrderedBox(props: OrderedBoxProps) {
  const { children, add, warn, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.orderedBox,
        add && styles.orderedBoxAdd,
        warn && styles.orderedBoxWarn,
        add && hasSubtitle && styles.orderedBoxAddHasSubtitle,
        add && !hasSubtitle && styles.orderedBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type SplitOrderBoxProps = {
  add?: boolean;
  warn?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function SplitOrderBox(props: SplitOrderBoxProps) {
  const { children, warn, add, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.splitOrderBox,
        add && hasSubtitle && styles.splitOrderBoxAddHasSubtitle,
        warn && styles.splitOrderBoxWarn,
        add && !hasSubtitle && styles.splitOrderBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type DynamicOrderBoxProps = React.PropsWithChildren<{
  add?: boolean;
  warnColor?: string;
  hasSubtitle: boolean;
}>;

function DynamicOrderBox(props: DynamicOrderBoxProps) {
  const { children, warnColor, add, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.dynamicOrderBox,
        add && hasSubtitle && styles.dynamicOrderBoxAddHasSubtitle,
        warnColor ? styles.dynamicOrderBoxColor(warnColor) : undefined,
        add && !hasSubtitle && styles.dynamicOrderBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type StyleFnParentBoxProps = React.PropsWithChildren<{
  add?: boolean;
  warn?: boolean;
  hasSubtitle: boolean;
  width: number;
}>;

function StyleFnParentBox(props: StyleFnParentBoxProps) {
  const { children, width, warn, add, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.styleFnParentBox,
        add && styles.styleFnParentBoxWidth(`${width}px`),
        warn && styles.styleFnParentBoxWarn,
        add && hasSubtitle && styles.styleFnParentBoxAddHasSubtitle,
        add && !hasSubtitle && styles.styleFnParentBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type InverseMergeBoxProps = React.PropsWithChildren<{
  tone: "primary" | "secondary";
  warn?: boolean;
  hasSubtitle: boolean;
}>;

function InverseMergeBox(props: InverseMergeBoxProps) {
  const { children, tone, hasSubtitle, warn } = props;
  return (
    <div
      sx={[
        styles.inverseMergeBox,
        tone === "primary" && hasSubtitle && styles.inverseMergeBoxTonePrimaryHasSubtitle,
        tone === "primary" && !hasSubtitle && styles.inverseMergeBoxTonePrimaryNotHasSubtitle,
        warn && styles.inverseMergeBoxWarn,
        tone !== "primary" && styles.inverseMergeBoxToneNotPrimary,
      ]}
    >
      {children}
    </div>
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
    <OrderedBox add warn hasSubtitle>
      Add + warn + subtitle stays red
    </OrderedBox>
    <OrderedBox add warn hasSubtitle={false}>
      Add + warn + no subtitle stays red
    </OrderedBox>
    <SplitOrderBox add warn hasSubtitle>
      Split order subtitle stays green
    </SplitOrderBox>
    <SplitOrderBox add warn hasSubtitle={false}>
      Split order no subtitle stays red
    </SplitOrderBox>
    <DynamicOrderBox add warnColor="green" hasSubtitle>
      Dynamic order subtitle stays green
    </DynamicOrderBox>
    <DynamicOrderBox add warnColor="green" hasSubtitle={false}>
      Dynamic order no subtitle stays red
    </DynamicOrderBox>
    <StyleFnParentBox add warn hasSubtitle width={80}>
      Style fn parent subtitle stays red
    </StyleFnParentBox>
    <StyleFnParentBox add warn hasSubtitle={false} width={80}>
      Style fn parent no subtitle stays red
    </StyleFnParentBox>
    <InverseMergeBox tone="primary" warn hasSubtitle>
      Primary inverse subtitle stays green
    </InverseMergeBox>
    <InverseMergeBox tone="primary" warn hasSubtitle={false}>
      Primary inverse no subtitle stays green
    </InverseMergeBox>
    <InverseMergeBox tone="secondary" warn={false} hasSubtitle>
      Secondary inverse stays blue
    </InverseMergeBox>
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
  orderedBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  orderedBoxAdd: {
    color: "red",
  },
  orderedBoxWarn: {
    color: "green",
  },
  orderedBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  orderedBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  splitOrderBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  splitOrderBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  splitOrderBoxWarn: {
    color: "green",
  },
  splitOrderBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  dynamicOrderBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  dynamicOrderBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  dynamicOrderBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  dynamicOrderBoxColor: (color: string) => ({
    color,
  }),
  styleFnParentBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  styleFnParentBoxWarn: {
    color: "green",
  },
  styleFnParentBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  styleFnParentBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  styleFnParentBoxWidth: (width: string) => ({
    width,
  }),
  inverseMergeBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  inverseMergeBoxTonePrimaryHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  inverseMergeBoxTonePrimaryNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  inverseMergeBoxWarn: {
    color: "green",
  },
  inverseMergeBoxToneNotPrimary: {
    color: "blue",
  },
});
