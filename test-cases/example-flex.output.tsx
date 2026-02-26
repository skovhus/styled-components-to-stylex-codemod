// Real-world Flex utility component with shouldForwardProp and many conditional interpolations
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type JustifyValues =
  | "center"
  | "stretch"
  | "space-around"
  | "space-between"
  | "space-evenly"
  | "flex-start"
  | "flex-end";
type AlignValues = "stretch" | "center" | "baseline" | "flex-start" | "flex-end";

/** Props for the Flex component */
export type FlexProps = Omit<React.ComponentProps<"div">, "className"> & {
  /** Set `flex-direction` to `column` */
  column?: boolean;
  /** Sets flex direction to either `row-reverse` or `column-reverse` (depending on direction of `column` prop) */
  reverse?: boolean;
  /** Center all content. Shortcut for `align=center` and `justify=center` combination. */
  center?: boolean;
  /** Set `align-items`. */
  align?: AlignValues;
  /** Set `align-self`. */
  alignSelf?: AlignValues;
  /** Set `justify-content`. */
  justify?: JustifyValues;
  /** Set `flex=1` */
  auto?: boolean;
  /** The classname to apply to the container. */
  className?: string;
  /** The children to render. */
  children?: React.ReactNode;
  /** Set `flex-grow` value. */
  grow?: number;
  /** Set `flex-shrink` value. */
  shrink?: number;
  /** Set `flex-wrap` value. */
  wrap?: boolean;
  /** Set `display=inline-flex`. */
  inline?: boolean;
  /** Mark as disabled */
  disabled?: boolean;
  /** Space between items */
  gap?: number;
  /** Space between wrapped lines, defaults to gap if not provided */
  wrapGap?: number;
  /** Hides overflow */
  overflowHidden?: boolean;
  /**
   * Set min-width: 0px to truncate child text elements.
   * https://css-tricks.com/flexbox-truncated-text/#aa-the-solution-is-min-width-0-on-the-flex-child
   */
  noMinWidth?: boolean;
  /** Set min-height: 0px to truncate child text elements. */
  noMinHeight?: boolean;
};

/** Prop keys for the Flex component */
export const flexPropKeys = [
  "column",
  "reverse",
  "center",
  "align",
  "alignSelf",
  "justify",
  "auto",
  "grow",
  "shrink",
  "wrap",
  "inline",
  "disabled",
  "gap",
  "wrapGap",
  "overflowHidden",
  "noMinWidth",
  "noMinHeight",
];

/**
 * Generic flexbox div component.
 */
export function Flex(props: FlexProps) {
  const {
    children,
    style,
    column,
    reverse,
    center,
    align,
    alignSelf,
    justify,
    auto,
    grow,
    shrink,
    wrap,
    inline,
    disabled,
    gap,
    wrapGap,
    overflowHidden,
    noMinWidth,
    noMinHeight,
    ...rest
  } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.flex,
          typeof grow === "number" ? styles.flexGrow(grow) : undefined,
          typeof shrink === "number" ? styles.flexShrink(shrink) : undefined,
          typeof gap === "number" ? styles.flexGap(gap) : undefined,
          typeof wrapGap === "number"
            ? column
              ? styles.flexColumnGap(wrapGap)
              : styles.flexRowGap(wrapGap)
            : undefined,
          inline ? styles.flexInline : undefined,
          auto ? styles.flexAuto : undefined,
          align != null && alignVariants[align],
          justify != null && justifyVariants[justify],
          center === true && styles.flexCenter,
          wrap ? styles.flexWrap : undefined,
          alignSelf ? styles.flexAlignSelf(alignSelf) : undefined,
          overflowHidden ? styles.flexOverflowHidden : undefined,
          noMinWidth ? styles.flexNoMinWidth : undefined,
          noMinHeight ? styles.flexNoMinHeight : undefined,
        ],
        undefined,
        {
          flexDirection: props.column
            ? props.reverse
              ? "column-reverse"
              : "column"
            : props.reverse
              ? "row-reverse"
              : "row",
          ...style,
        },
      )}
    >
      {children}
    </div>
  );
}

/** A flex spacer */
export function FlexSpacer(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.flexSpacer)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
    {/* Basic row (default) */}
    <Flex style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Row Default</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Item</div>
    </Flex>

    {/* Column layout */}
    <Flex column style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Item</div>
    </Flex>

    {/* Column reverse */}
    <Flex column reverse style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column Reverse</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Item</div>
    </Flex>

    {/* Center only */}
    <Flex center style={{ backgroundColor: "#f0f0f0", padding: 8, minHeight: 80 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Center Only</div>
    </Flex>

    {/* CASCADE BUG: center + align — center is later in CSS so it should override align */}
    <Flex
      center
      align="flex-start"
      style={{ backgroundColor: "#ffe0e0", padding: 8, minHeight: 80 }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        center + align=flex-start (should be centered)
      </div>
    </Flex>

    {/* CASCADE BUG: center + justify — center should override justify */}
    <Flex
      center
      justify="flex-end"
      style={{ backgroundColor: "#ffe0e0", padding: 8, minHeight: 80 }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        center + justify=flex-end (should be centered)
      </div>
    </Flex>

    {/* CASCADE BUG: center + both align and justify — center should override both */}
    <Flex
      center
      align="flex-end"
      justify="space-between"
      style={{ backgroundColor: "#ffe0e0", padding: 8, minHeight: 80 }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        center + align=flex-end + justify=space-between (should be centered)
      </div>
    </Flex>

    {/* Justify + align without center */}
    <Flex justify="space-between" align="center" style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Space Between</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Aligned Center</div>
    </Flex>

    {/* Auto flex */}
    <Flex auto style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Auto Flex</div>
    </Flex>

    {/* Wrap + gap */}
    <Flex wrap gap={8} style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Wrap</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Gap 8</div>
    </Flex>

    {/* Grow + shrink */}
    <Flex grow={2} shrink={0} style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Grow 2, Shrink 0</div>
    </Flex>

    {/* Inline flex */}
    <Flex inline style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Inline Flex</div>
    </Flex>

    {/* Overflow hidden + no min width */}
    <Flex overflowHidden noMinWidth style={{ backgroundColor: "#f0f0f0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        Overflow Hidden, No Min Width
      </div>
    </Flex>

    {/* Gap + wrapGap override (row) */}
    <Flex
      wrap
      gap={4}
      wrapGap={16}
      style={{ backgroundColor: "#f0f0f0", padding: 8, maxWidth: 200 }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>A</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>B</div>
      <div style={{ padding: 8, backgroundColor: "#74bf4f", color: "white" }}>C</div>
      <div style={{ padding: 8, backgroundColor: "#bf744f", color: "white" }}>D</div>
    </Flex>

    {/* Gap + wrapGap override (column) */}
    <Flex
      column
      wrap
      gap={4}
      wrapGap={16}
      style={{ backgroundColor: "#f0f0f0", padding: 8, maxHeight: 80 }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>A</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>B</div>
      <div style={{ padding: 8, backgroundColor: "#74bf4f", color: "white" }}>C</div>
      <div style={{ padding: 8, backgroundColor: "#bf744f", color: "white" }}>D</div>
    </Flex>

    {/* INLINE STYLE BUG: style prop should override class-based flexDirection */}
    <Flex style={{ backgroundColor: "#ffe0e0", padding: 8, flexDirection: "column" }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        style flexDirection=column (should be column)
      </div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Item</div>
    </Flex>

    {/* INLINE STYLE BUG: style prop should override class-based display */}
    <Flex
      style={{
        backgroundColor: "#ffe0e0",
        padding: 8,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
      }}
    >
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>
        style display=grid (should be 2-col grid)
      </div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Item</div>
    </Flex>

    {/* FlexSpacer pushes items apart */}
    <div style={{ display: "flex", gap: 8, backgroundColor: "#e0e0e0", padding: 8 }}>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Before</div>
      <FlexSpacer />
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>After</div>
    </div>
  </div>
);

const styles = stylex.create({
  flexGrow: (grow: number | undefined) => ({
    flexGrow: grow,
  }),
  flexShrink: (shrink: number | undefined) => ({
    flexShrink: shrink,
  }),
  flexGap: (gap: number | undefined) => ({
    gap: `${gap}px`,
  }),
  flexColumnGap: (wrapGap: number | undefined) => ({
    columnGap: `${wrapGap}px`,
  }),
  flexRowGap: (wrapGap: number | undefined) => ({
    rowGap: `${wrapGap}px`,
  }),
  /**
   * Generic flexbox div component.
   */
  flex: {
    display: "flex",
    flex: "initial",
  },
  flexInline: {
    display: "inline-flex",
  },
  flexAuto: {
    flex: "1 1 auto",
  },
  flexCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  flexWrap: {
    flexWrap: "wrap",
  },
  flexOverflowHidden: {
    overflow: "hidden",
  },
  flexNoMinWidth: {
    minWidth: "0px",
  },
  flexNoMinHeight: {
    minHeight: "0px",
  },
  flexAlignSelf: (alignSelf: AlignValues) => ({
    alignSelf,
  }),
  flexSpacer: {
    display: "flex",
    flex: "auto",
  },
});

const alignVariants = stylex.create({
  stretch: {
    alignItems: "stretch",
  },
  center: {
    alignItems: "center",
  },
  baseline: {
    alignItems: "baseline",
  },
  "flex-start": {
    alignItems: "flex-start",
  },
  "flex-end": {
    alignItems: "flex-end",
  },
});

const justifyVariants = stylex.create({
  center: {
    justifyContent: "center",
  },
  stretch: {
    justifyContent: "stretch",
  },
  "space-around": {
    justifyContent: "space-around",
  },
  "space-between": {
    justifyContent: "space-between",
  },
  "space-evenly": {
    justifyContent: "space-evenly",
  },
  "flex-start": {
    justifyContent: "flex-start",
  },
  "flex-end": {
    justifyContent: "flex-end",
  },
});
