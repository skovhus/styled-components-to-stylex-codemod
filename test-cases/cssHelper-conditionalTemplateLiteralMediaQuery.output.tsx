import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BannerProps = React.PropsWithChildren<{
  prominent: boolean;
  ref?: React.Ref<HTMLDivElement>;
}>;

/**
 * Tests that template literal CSS blocks inside ternary conditional
 * expressions correctly handle @media rules instead of silently dropping them.
 * Exercises the `resolveTemplateLiteralBranch` code path (prop-conditional
 * ternary with plain template literal branches).
 */
function Banner(props: BannerProps) {
  const { children, prominent, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[styles.banner, prominent ? styles.bannerProminent : styles.bannerNotProminent]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Banner prominent={false}>Default Banner</Banner>
    <Banner prominent={true}>Prominent Banner</Banner>
  </div>
);

const styles = stylex.create({
  banner: {
    color: "black",
    backgroundColor: "#f0f0f0",
  },
  bannerProminent: {
    fontWeight: "bold",
    fontSize: {
      default: 18,
      "@media (min-width: 768px)": 24,
    },
  },
  bannerNotProminent: {
    fontWeight: "normal",
    fontSize: {
      default: 14,
      "@media (min-width: 768px)": 16,
    },
  },
});
