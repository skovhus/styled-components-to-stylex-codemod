import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type HeaderProps = React.PropsWithChildren<{
  isCompact?: boolean;
  align?: keyof typeof headerAlignVariants;
  gap?: keyof typeof headerGapVariants;
  justify?: keyof typeof headerJustifyVariants;
}>;

function Header(props: HeaderProps) {
  const { children, align, gap, justify, isCompact } = props;

  return (
    <div
      sx={[
        styles.header,
        gap != null && headerGapVariants[gap],
        justify != null && headerJustifyVariants[justify],
        align != null && headerAlignVariants[align],
        isCompact ? styles.headerCompact : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Header justify="center" gap={12}>
        <span>Centered with gap</span>
      </Header>
      <Header align="center" isCompact>
        <span>Aligned compact</span>
      </Header>
      <Header gap={8} align="center" justify="flex-start">
        <span>All three</span>
      </Header>
    </div>
  );
}

const styles = stylex.create({
  header: {
    display: "flex",
    flexDirection: "row",
    padding: "16px",
    backgroundColor: "#f0f5ff",
  },
  headerCompact: {
    padding: "4px",
  },
});

const headerGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  12: {
    gap: "12px",
  },
});

const headerJustifyVariants = stylex.create({
  center: {
    justifyContent: "center",
  },
  "flex-start": {
    justifyContent: "flex-start",
  },
});

const headerAlignVariants = stylex.create({
  center: {
    alignItems: "center",
  },
});
