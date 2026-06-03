import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

const OFFSET_PX = 40;
const SETTINGS = {
  travelDurationSeconds: 1.8,
  pauseDurationSeconds: 0.45,
};
const DURATION_SECONDS = SETTINGS.travelDurationSeconds;
const RUN_PERCENT = Math.min(
  99.999,
  (SETTINGS.travelDurationSeconds /
    (SETTINGS.travelDurationSeconds + SETTINGS.pauseDurationSeconds)) *
    100,
);

type ShimmerTextProps = React.PropsWithChildren<{
  imageUrl: string;
}>;

function ShimmerText(props: ShimmerTextProps) {
  const { children, imageUrl } = props;
  const theme = useTheme();

  return (
    <span
      sx={styles.shimmerText(
        {
          imageUrl,
        },
        theme,
      )}
    >
      {children}
    </span>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8 }}>
    <div sx={styles.box}>Hi</div>
    <ShimmerText imageUrl="/shine.png">Layered shimmer</ShimmerText>
  </div>
);

const sweep = stylex.keyframes({
  from: {
    transform: `translateX(-${OFFSET_PX}px)`,
  },

  to: {
    transform: "translateX(100%)",
  },
});

const chromaticSweep = stylex.keyframes({
  "0%": {
    backgroundPosition: `-${OFFSET_PX}px 50%,0 50%`,
  },

  "80%": {
    backgroundPosition: `${OFFSET_PX}px 50%,0 50%`,
  },

  "100%": {
    backgroundPosition: `${OFFSET_PX}px 50%,0 50%`,
  },
});

const styles = stylex.create({
  box: {
    display: "inline-block",
    animationName: sweep,
    animationDuration: `${DURATION_SECONDS}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    paddingBlock: 8,
    paddingInline: 12,
  },
  shimmerText: (props, theme) => ({
    color: "transparent",
    backgroundClip: "text",
    animationName: chromaticSweep,
    animationDuration: `${DURATION_SECONDS}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    backgroundImage: `url("${props.imageUrl}"),linear-gradient(
      ${theme.isDark ? theme.color.labelBase : theme.color.labelMuted},
      ${theme.isDark ? theme.color.labelBase : theme.color.labelMuted}
    )`,
  }),
});
