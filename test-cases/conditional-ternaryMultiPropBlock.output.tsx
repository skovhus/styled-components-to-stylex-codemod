// Ternary that returns multi-line CSS blocks (multiple declarations per branch).
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
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
} & Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "gap" | "column">;

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

type GroupedInverseBoxProps = {
  add?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function GroupedInverseBox(props: GroupedInverseBoxProps) {
  const { children, add, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.groupedInverseBox,
        !add && styles.groupedInverseBoxNotAdd,
        add && hasSubtitle && styles.groupedInverseBoxAddHasSubtitle,
        add && !hasSubtitle && styles.groupedInverseBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type KeyCollisionBoxProps = {
  foo?: boolean;
  bar?: boolean;
  fooBar?: boolean;
  baz: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function KeyCollisionBox(props: KeyCollisionBoxProps) {
  const { children, fooBar, foo, bar, baz } = props;
  return (
    <div
      sx={[
        styles.keyCollisionBox,
        fooBar && styles.keyCollisionBoxFooBar,
        foo && bar && baz && styles.keyCollisionBoxFooBarBaz,
        foo && bar && !baz && styles.keyCollisionBoxFooBarNotBaz,
      ]}
    >
      {children}
    </div>
  );
}

type StyleFnKeyCollisionBoxProps = React.PropsWithChildren<{
  color?: string;
  hasSubtitle: boolean;
}>;

function StyleFnKeyCollisionBox(props: StyleFnKeyCollisionBoxProps) {
  const { children, color, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.styleFnKeyCollisionBox,
        color != null && styles.styleFnKeyCollisionBoxColor(color),
        color && hasSubtitle ? styles.styleFnKeyCollisionBoxColorHasSubtitle : undefined,
        color && !hasSubtitle ? styles.styleFnKeyCollisionBoxColorNotHasSubtitle : undefined,
      ]}
    >
      {children}
    </div>
  );
}

type AfterBaseCollisionBoxProps = {
  after1?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function AfterBaseCollisionBox(props: AfterBaseCollisionBoxProps) {
  const { children, after1, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.afterBaseCollisionBox,
        helpers.flexCenter,
        styles.afterBaseCollisionBoxAfter1,
        after1 && hasSubtitle && styles.afterBaseCollisionBoxAfter1HasSubtitle,
        after1 && !hasSubtitle && styles.afterBaseCollisionBoxAfter1NotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type StaleBucketOrderBoxProps = {
  add?: boolean;
  warn?: boolean;
  hasSubtitle: boolean;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

function StaleBucketOrderBox(props: StaleBucketOrderBoxProps) {
  const { children, add, warn, hasSubtitle } = props;
  return (
    <div
      sx={[
        styles.staleBucketOrderBox,
        add && styles.staleBucketOrderBoxAdd,
        warn && styles.staleBucketOrderBoxWarn,
        add && hasSubtitle && styles.staleBucketOrderBoxAddHasSubtitle,
        add && !hasSubtitle && styles.staleBucketOrderBoxAddNotHasSubtitle,
      ]}
    >
      {children}
    </div>
  );
}

type ConsolidatedKeyCollisionBoxProps = React.PropsWithChildren<{
  add?: number;
  hasSubtitle: boolean;
}>;

function ConsolidatedKeyCollisionBox(props: ConsolidatedKeyCollisionBoxProps) {
  const { children, add, hasSubtitle, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.consolidatedKeyCollisionBox,
        add != null && styles.consolidatedKeyCollisionBoxWidth(add),
        add != null && styles.consolidatedKeyCollisionBoxHeight(add),
        add && hasSubtitle ? styles.consolidatedKeyCollisionBoxAddHasSubtitle : undefined,
        add && !hasSubtitle ? styles.consolidatedKeyCollisionBoxAddNotHasSubtitle : undefined,
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
    <GroupedInverseBox add hasSubtitle>
      Grouped inverse subtitle stays red
    </GroupedInverseBox>
    <GroupedInverseBox add hasSubtitle={false}>
      Grouped inverse no subtitle stays red
    </GroupedInverseBox>
    <GroupedInverseBox add={false} hasSubtitle>
      Grouped inverse no add stays blue
    </GroupedInverseBox>
    <KeyCollisionBox foo bar baz fooBar={false}>
      Key collision factored branch stays red
    </KeyCollisionBox>
    <KeyCollisionBox foo={false} bar={false} baz={false} fooBar>
      Key collision existing prop stays blue
    </KeyCollisionBox>
    <StyleFnKeyCollisionBox color="green" hasSubtitle>
      Style fn key collision keeps green text
    </StyleFnKeyCollisionBox>
    <StyleFnKeyCollisionBox color="green" hasSubtitle={false}>
      Style fn key collision no subtitle keeps green text
    </StyleFnKeyCollisionBox>
    <AfterBaseCollisionBox after1 hasSubtitle>
      After-base key collision subtitle stays red
    </AfterBaseCollisionBox>
    <AfterBaseCollisionBox after1 hasSubtitle={false}>
      After-base key collision no subtitle stays red
    </AfterBaseCollisionBox>
    <StaleBucketOrderBox add warn hasSubtitle>
      Stale bucket subtitle stays green
    </StaleBucketOrderBox>
    <StaleBucketOrderBox add warn hasSubtitle={false}>
      Stale bucket no subtitle stays green
    </StaleBucketOrderBox>
    <ConsolidatedKeyCollisionBox add={80} hasSubtitle>
      Consolidated key collision subtitle stays red
    </ConsolidatedKeyCollisionBox>
    <ConsolidatedKeyCollisionBox add={80} hasSubtitle={false}>
      Consolidated key collision no subtitle stays red
    </ConsolidatedKeyCollisionBox>
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
  groupedInverseBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  groupedInverseBoxNotAdd: {
    color: "blue",
  },
  groupedInverseBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  groupedInverseBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  keyCollisionBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  keyCollisionBoxFooBar: {
    color: "blue",
  },
  keyCollisionBoxFooBarBaz: {
    color: "red",
    paddingBottom: 20,
  },
  keyCollisionBoxFooBarNotBaz: {
    color: "red",
    paddingBottom: 40,
  },
  styleFnKeyCollisionBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  styleFnKeyCollisionBoxColorHasSubtitle: {
    borderColor: "red",
    paddingBottom: 20,
  },
  styleFnKeyCollisionBoxColorNotHasSubtitle: {
    borderColor: "red",
    paddingBottom: 40,
  },
  styleFnKeyCollisionBoxColor: (color: string) => ({
    color,
  }),
  afterBaseCollisionBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  afterBaseCollisionBoxAfter1: {
    backgroundColor: "white",
  },
  afterBaseCollisionBoxAfter1HasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  afterBaseCollisionBoxAfter1NotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  staleBucketOrderBox: {
    padding: 8,
  },
  staleBucketOrderBoxAdd: {
    color: "red",
  },
  staleBucketOrderBoxWarn: {
    color: "green",
  },
  staleBucketOrderBoxAddHasSubtitle: {
    backgroundColor: "#fff0f0",
  },
  staleBucketOrderBoxAddNotHasSubtitle: {
    backgroundColor: "#fff8e1",
  },
  consolidatedKeyCollisionBox: {
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  consolidatedKeyCollisionBoxAddHasSubtitle: {
    color: "red",
    paddingBottom: 20,
  },
  consolidatedKeyCollisionBoxAddNotHasSubtitle: {
    color: "red",
    paddingBottom: 40,
  },
  consolidatedKeyCollisionBoxWidth: (width: number) => ({
    width: `${width}px`,
  }),
  consolidatedKeyCollisionBoxHeight: (height: number) => ({
    height: `${height}px`,
  }),
});
