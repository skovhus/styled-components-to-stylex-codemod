import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";
import { $colors, transitionSpeed as transitionSpeedVars, $glowShadow } from "./tokens.stylex";
import { color, highlightStyles } from "./lib/helpers";

function Tab(props: React.PropsWithChildren<{ "data-state"?: boolean | string }>) {
  const theme = useTheme();

  return <button {...props} sx={[styles.tab, theme.isDark ? styles.tabDark : styles.tabLight]} />;
}

type CardButtonProps = React.PropsWithChildren<{
  interactive?: boolean;
}>;

function CardButton(props: CardButtonProps) {
  const { children, interactive } = props;
  return (
    <button sx={[styles.cardButton, interactive && styles.cardButtonInteractive]}>
      {children}
    </button>
  );
}

type IconWrapperProps = React.PropsWithChildren<{
  background?: string;
}>;

function IconWrapper(props: IconWrapperProps) {
  const { children, background } = props;
  return (
    <span
      sx={[
        background
          ? highlightStyles({
              active: styles.iconWrapperBackgroundPseudoActive,
              hover: styles.iconWrapperBackgroundPseudoHover,
            })
          : undefined,
        styles.iconWrapper,
        background != null && styles.iconWrapperBackgroundColor(background),
        background ? styles.iconWrapperBackground : undefined,
      ]}
    >
      {children}
    </span>
  );
}

type FalsyGuardIconProps = { disabled?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

function FalsyGuardIcon(props: FalsyGuardIconProps) {
  const { children, disabled } = props;
  return (
    <span
      sx={[
        !disabled &&
          highlightStyles({
            active: styles.falsyGuardIconNotDisabledPseudoActive,
            hover: styles.falsyGuardIconNotDisabledPseudoHover,
          }),
        styles.falsyGuardIcon,
        !disabled && styles.falsyGuardIconNotDisabledRoot,
      ]}
    >
      {children}
    </span>
  );
}

type FocusAliasIconProps = { active?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

function FocusAliasIcon(props: FocusAliasIconProps) {
  const { active, ...rest } = props;
  return (
    <span
      {...rest}
      sx={[
        active
          ? highlightStyles({
              active: styles.focusAliasIconActivePseudoActive,
              hover: styles.focusAliasIconActivePseudoHover,
            })
          : undefined,
        styles.focusAliasIcon,
      ]}
    />
  );
}

type AliasWithDefaultIconProps = { active?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

function AliasWithDefaultIcon(props: AliasWithDefaultIconProps) {
  const { active, ...rest } = props;
  return (
    <span
      {...rest}
      sx={[
        active
          ? highlightStyles({
              active: styles.aliasWithDefaultIconActivePseudoActive,
              hover: styles.aliasWithDefaultIconActivePseudoHover,
            })
          : undefined,
        styles.aliasWithDefaultIcon,
        active ? styles.aliasWithDefaultIconActiveRoot : undefined,
      ]}
    />
  );
}

type OrderedAliasIconProps = React.PropsWithChildren<{
  active?: boolean;
  color: string;
}>;

function OrderedAliasIcon(props: OrderedAliasIconProps) {
  const { children, color, active } = props;
  return (
    <span
      sx={[
        active
          ? highlightStyles({
              active: styles.orderedAliasIconActivePseudoActive,
              hover: styles.orderedAliasIconActivePseudoHover,
            })
          : undefined,
        styles.orderedAliasIcon,
        styles.orderedAliasIconColor(color),
      ]}
    >
      {children}
    </span>
  );
}

type DualAliasIconProps = { active?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

function DualAliasIcon(props: DualAliasIconProps) {
  const { active, ...rest } = props;
  return (
    <span
      {...rest}
      sx={[
        active
          ? highlightStyles({
              active: styles.dualAliasIconActivePseudoActive,
              hover: styles.dualAliasIconActivePseudoHover,
            })
          : undefined,
        active
          ? highlightStyles({
              active: styles.dualAliasIconActivePseudoActive2,
              hover: styles.dualAliasIconActivePseudoHover2,
            })
          : undefined,
        styles.dualAliasIcon,
      ]}
    />
  );
}

type MultiPseudoIconProps = { active?: boolean } & Omit<
  React.ComponentProps<"span">,
  "className" | "style" | "sx"
>;

function MultiPseudoIcon(props: MultiPseudoIconProps) {
  const { active, ...rest } = props;
  return <span {...rest} sx={[styles.multiPseudoIcon, active && styles.multiPseudoIconActive]} />;
}

type FiniteCssBlockProps = React.PropsWithChildren<{
  enabled?: boolean;
  visible?: boolean;
  wide?: boolean;
  image?: boolean;
}>;

function FiniteCssBlock(props: FiniteCssBlockProps) {
  const { children, visible, wide, image, enabled } = props;
  const theme = useTheme();

  return (
    <span
      sx={[
        styles.finiteCssBlock,
        enabled && styles.finiteCssBlockEnabled,
        enabled && visible && styles.finiteCssBlockEnabledVisible,
        enabled && wide && styles.finiteCssBlockEnabledWide,
        enabled && !wide && styles.finiteCssBlockEnabledNotWide,
        enabled && image && styles.finiteCssBlockEnabledImage,
        enabled && !image && styles.finiteCssBlockEnabledNotImage,
        enabled && theme.isDark ? styles.finiteCssBlockEnabledThemeIsDark : undefined,
        enabled && !theme.isDark && styles.finiteCssBlockEnabledNotThemeIsDark,
      ]}
    >
      {children}
    </span>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, width: 718 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
    <CardButton interactive>Interactive</CardButton>
    <IconWrapper background="#fed7aa">Icon</IconWrapper>
    <IconWrapper>Plain icon</IconWrapper>
    <FalsyGuardIcon>Enabled icon</FalsyGuardIcon>
    <FalsyGuardIcon disabled>Disabled icon</FalsyGuardIcon>
    <FocusAliasIcon active tabIndex={0}>
      Focus alias
    </FocusAliasIcon>
    <AliasWithDefaultIcon active tabIndex={0}>
      Alias default
    </AliasWithDefaultIcon>
    <OrderedAliasIcon active color="#2563eb">
      Alias order
    </OrderedAliasIcon>
    <DualAliasIcon active tabIndex={0}>
      Dual alias
    </DualAliasIcon>
    <MultiPseudoIcon active tabIndex={0}>
      Multi pseudo
    </MultiPseudoIcon>
    <FiniteCssBlock enabled visible wide image>
      Visible finite block
    </FiniteCssBlock>
    <FiniteCssBlock enabled>Hidden finite block</FiniteCssBlock>
  </div>
);

const styles = stylex.create({
  tab: {
    color: "#111",
    borderRadius: 5,
    boxShadow: "none",
  },
  tabDark: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgSub,
    },
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
  tabLight: {
    backgroundColor: {
      default: null,
      ':is([data-state="active"])': $colors.bgBase,
    },
    boxShadow: {
      default: "none",
      ':is([data-state="active"])': `0 0 0 1px ${$colors.bgBorderFaint}`,
    },
  },
  cardButton: {
    color: "#334155",
    backgroundColor: "#f8fafc",
  },
  cardButtonInteractive: {
    cursor: "pointer",
    backgroundColor: {
      default: "#f8fafc",
      ":active": $colors.bgBaseHover,
      ":hover": {
        default: "#f8fafc",
        [$interaction.canHover]: $colors.bgBaseHover,
      },
    },
    color: {
      default: "#334155",
      ":active": $colors.labelTitle,
      ":hover": {
        default: "#334155",
        [$interaction.canHover]: $colors.labelTitle,
      },
    },
  },
  iconWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    transitionProperty: "background-color,border",
    transitionDuration: transitionSpeedVars.normal,
  },
  iconWrapperBackgroundPseudoActive: {
    backgroundColor: {
      ":active": $colors.bgBorderSolid,
    },
    borderColor: {
      ":active": $colors.bgBorderSolid,
    },
    boxShadow: {
      ":active": $glowShadow.dark,
    },
    transitionDuration: {
      ":active": transitionSpeedVars.fast,
    },
  },
  iconWrapperBackgroundPseudoHover: {
    backgroundColor: {
      ":hover": $colors.bgBorderSolid,
    },
    borderColor: {
      ":hover": $colors.bgBorderSolid,
    },
    boxShadow: {
      ":hover": $glowShadow.dark,
    },
    transitionDuration: {
      ":hover": transitionSpeedVars.fast,
    },
  },
  iconWrapperBackground: {
    borderRadius: 4,
    opacity: 1,
  },
  iconWrapperBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  falsyGuardIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#eef2ff",
    color: "#312e81",
  },
  falsyGuardIconNotDisabledPseudoActive: {
    backgroundColor: {
      default: "#eef2ff",
      ":active": $colors.bgBaseHover,
    },
    color: {
      default: "#312e81",
      ":active": $colors.labelTitle,
    },
  },
  falsyGuardIconNotDisabledPseudoHover: {
    backgroundColor: {
      default: "#eef2ff",
      ":hover": $colors.bgBaseHover,
    },
    color: {
      default: "#312e81",
      ":hover": $colors.labelTitle,
    },
  },
  falsyGuardIconNotDisabledRoot: {
    cursor: "pointer",
  },
  focusAliasIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    color: "#475569",
  },
  focusAliasIconActivePseudoActive: {
    color: {
      default: "#475569",
      ":focus:active": $colors.labelTitle,
    },
  },
  focusAliasIconActivePseudoHover: {
    color: {
      default: "#475569",
      ":focus:hover": $colors.labelTitle,
    },
  },
  aliasWithDefaultIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    color: "#475569",
  },
  aliasWithDefaultIconActivePseudoActive: {
    color: {
      ":active": $colors.labelTitle,
    },
  },
  aliasWithDefaultIconActivePseudoHover: {
    color: {
      ":hover": $colors.labelTitle,
    },
  },
  aliasWithDefaultIconActiveRoot: {
    color: {
      default: "#2563eb",
      ":focus": "#16a34a",
    },
  },
  orderedAliasIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
  },
  orderedAliasIconActivePseudoActive: {
    color: {
      ":active": "#dc2626",
    },
  },
  orderedAliasIconActivePseudoHover: {
    color: {
      ":hover": "#dc2626",
    },
  },
  orderedAliasIconColor: (colorValue: string) => ({
    color: colorValue,
  }),
  dualAliasIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#f8fafc",
    color: "#334155",
  },
  dualAliasIconActivePseudoActive: {
    backgroundColor: {
      default: "#f8fafc",
      ":active": $colors.bgBaseHover,
    },
  },
  dualAliasIconActivePseudoHover: {
    backgroundColor: {
      default: "#f8fafc",
      ":hover": $colors.bgBaseHover,
    },
  },
  dualAliasIconActivePseudoActive2: {
    color: {
      default: "#334155",
      ":focus:active": $colors.labelTitle,
    },
  },
  dualAliasIconActivePseudoHover2: {
    color: {
      default: "#334155",
      ":focus:hover": $colors.labelTitle,
    },
  },
  multiPseudoIcon: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    color: "#475569",
  },
  multiPseudoIconActive: {
    color: {
      default: "#475569",
      ":hover": "#dc2626",
      ":focus": "#2563eb",
    },
  },
  finiteCssBlock: {
    display: "inline-flex",
    paddingBlock: 4,
    paddingInline: 8,
    color: "hotpink",
    backgroundColor: "blue",
  },
  finiteCssBlockEnabled: {
    opacity: 0,
    pointerEvents: "none",
  },
  finiteCssBlockEnabledVisible: {
    opacity: 1,
    pointerEvents: "auto",
  },
  finiteCssBlockEnabledWide: {
    paddingBlock: 8,
    paddingInline: 16,
  },
  finiteCssBlockEnabledNotWide: {
    paddingBlock: 4,
    paddingInline: 4,
  },
  finiteCssBlockEnabledImage: {
    backgroundImage: "url(/icon.png)",
    backgroundColor: "transparent",
  },
  finiteCssBlockEnabledNotImage: {
    backgroundColor: "red",
  },
  finiteCssBlockEnabledThemeIsDark: {
    marginBlock: 8,
    marginInline: 16,
  },
  finiteCssBlockEnabledNotThemeIsDark: {
    marginBlock: 4,
    marginInline: 4,
  },
});
