import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";
import { Flex } from "./lib/flex";

type Props = React.ComponentPropsWithRef<typeof Flex> & { sx?: stylex.StyleXStyles } & {
  $applyBackground?: boolean;
  gutter?: string;
};

export function ScrollableFlex(props: Props) {
  const { className, children, style, sx, $applyBackground, gutter, tabIndex, ...rest } = props;

  return (
    <Flex
      tabIndex={tabIndex ?? 0}
      {...rest}
      {...mergedSx(
        [
          styles.scrollableFlex,
          $applyBackground ? styles.scrollableFlexApplyBackground : undefined,
          props.gutter != null && styles.scrollableFlexScrollbarGutter(props.gutter),
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </Flex>
  );
}

export function ScrollableDiv(
  props: Props & React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles },
) {
  const { className, children, style, sx, $applyBackground, gutter, tabIndex, ...rest } = props;

  return (
    <div
      tabIndex={tabIndex ?? 0}
      {...rest}
      {...mergedSx(
        [
          styles.scrollableDiv,
          $applyBackground ? styles.scrollableDivApplyBackground : undefined,
          gutter != null && styles.scrollableDivScrollbarGutter(gutter),
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <ScrollableFlex>Flex: Tab me!</ScrollableFlex>
    <ScrollableDiv>Div: Tab me!</ScrollableDiv>
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
});
