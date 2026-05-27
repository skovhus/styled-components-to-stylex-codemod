import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";
import { Flex } from "./lib/flex";

type Props = {
  applyBackground?: boolean;
  gutter?: string;
};

type ScrollableFlexProps = Props & {
  className?: string;
  style?: React.CSSProperties;
  sx?: stylex.StyleXStyles;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "$applyBackground">;

export function ScrollableFlex(props: ScrollableFlexProps) {
  const { className, style, sx, applyBackground, tabIndex, ...rest } = props;
  return (
    <Flex
      tabIndex={tabIndex ?? 0}
      {...rest}
      {...mergedSx(
        [
          styles.scrollableFlex,
          applyBackground ? styles.scrollableFlexApplyBackground : undefined,
          props.gutter != null && styles.scrollableFlexScrollbarGutter(props.gutter),
          sx,
        ],
        className,
        style,
      )}
    />
  );
}

export function ScrollableDiv(
  props: Props & React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles },
) {
  const { className, style, sx, applyBackground, gutter, tabIndex, ...rest } = props;
  return (
    <div
      tabIndex={tabIndex ?? 0}
      {...rest}
      {...mergedSx(
        [
          styles.scrollableDiv,
          applyBackground ? styles.scrollableDivApplyBackground : undefined,
          gutter != null && styles.scrollableDivScrollbarGutter(gutter),
          sx,
        ],
        className,
        style,
      )}
    />
  );
}

type TabIndexInStyleProps = { applyBackground?: boolean } & React.ComponentProps<"div"> & {
    sx?: stylex.StyleXStyles;
  };

// tabIndex used in BOTH attrs (with default) AND in styles
export function TabIndexInStyle(props: TabIndexInStyleProps) {
  const { className, style, sx, applyBackground, tabIndex = 0, ...rest } = props;
  return (
    <div
      tabIndex={tabIndex ?? 0}
      {...rest}
      {...mergedSx(
        [
          styles.tabIndexInStyle,
          applyBackground && styles.tabIndexInStyleApplyBackground,
          tabIndex === 0 && styles.tabIndexInStyleTabIndex0,
          sx,
        ],
        className,
        style,
      )}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", height: "200px" }}>
    <ScrollableFlex gutter="stable" applyBackground>
      <div style={{ height: "400px", padding: "8px" }}>
        Flex: Tab me! (scrollable with stable gutter)
      </div>
    </ScrollableFlex>
    <ScrollableDiv gutter="stable">
      <div style={{ height: "400px", padding: "8px" }}>
        Div: Tab me! (scrollable with stable gutter)
      </div>
    </ScrollableDiv>
    <TabIndexInStyle>Tab index in style</TabIndexInStyle>
  </div>
);

const styles = stylex.create({
  scrollableFlex: {
    overflowY: "auto",
    position: "relative",
    flexGrow: 1,
    backgroundColor: "inherit",
    scrollbarGutter: "auto",
    outline: {
      default: null,
      ":focus-visible": "none",
    },
  },
  scrollableFlexApplyBackground: {
    backgroundColor: $colors.bgBase,
  },
  scrollableFlexScrollbarGutter: (scrollbarGutter: string) => ({
    scrollbarGutter,
  }),
  scrollableDiv: {
    overflowY: "auto",
    position: "relative",
    backgroundColor: "inherit",
    scrollbarGutter: "auto",
    outline: {
      default: null,
      ":focus-visible": "none",
    },
  },
  scrollableDivApplyBackground: {
    backgroundColor: $colors.bgBase,
  },
  scrollableDivScrollbarGutter: (scrollbarGutter: string) => ({
    scrollbarGutter,
  }),
  tabIndexInStyle: {
    overflowY: "auto",
    position: "relative",
    flexGrow: 1,
    backgroundColor: "inherit",
    outline: "auto",
  },
  tabIndexInStyleApplyBackground: {
    backgroundColor: $colors.bgBase,
  },
  tabIndexInStyleTabIndex0: {
    outline: "none",
  },
});
