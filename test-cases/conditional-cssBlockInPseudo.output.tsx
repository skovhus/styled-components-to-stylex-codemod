import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";
import { $colors, transitionSpeed as transitionSpeedVars, $glowShadow } from "./tokens.stylex";
import { highlightStyles } from "./lib/helpers";

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
              active: styles.iconWrapperBackgroundPseudoActive as unknown as stylex.StyleXStyles,
              hover: styles.iconWrapperBackgroundPseudoHover as unknown as stylex.StyleXStyles,
            })
          : undefined,
        styles.iconWrapper,
        background != null && styles.iconWrapperBackgroundColor(background),
        background
          ? styles.iconWrapperBackground({
              background,
            })
          : undefined,
      ]}
    >
      {children}
    </span>
  );
}

type FalsyGuardIconProps = React.PropsWithChildren<{
  disabled?: boolean;
}>;

function FalsyGuardIcon(props: FalsyGuardIconProps) {
  const { children, disabled } = props;
  return (
    <span
      sx={[
        !disabled &&
          highlightStyles({
            active: styles.falsyGuardIconNotDisabledPseudoActive as unknown as stylex.StyleXStyles,
            hover: styles.falsyGuardIconNotDisabledPseudoHover as unknown as stylex.StyleXStyles,
          }),
        styles.falsyGuardIcon,
        !disabled && styles.falsyGuardIconNotDisabled,
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
              active: styles.focusAliasIconActivePseudoActive as unknown as stylex.StyleXStyles,
              hover: styles.focusAliasIconActivePseudoHover as unknown as stylex.StyleXStyles,
            })
          : undefined,
        styles.focusAliasIcon,
      ]}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
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
  iconWrapperBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  iconWrapperBackground: (props) => ({
    borderRadius: 4,
    opacity: props.background ? 1 : 0.8,
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
      ":active": $colors.bgBaseHover,
    },
    color: {
      ":active": $colors.labelTitle,
    },
  },
  falsyGuardIconNotDisabledPseudoHover: {
    backgroundColor: {
      ":hover": $colors.bgBaseHover,
    },
    color: {
      ":hover": $colors.labelTitle,
    },
  },
  falsyGuardIconNotDisabled: {
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
      ":focus:active": $colors.labelTitle,
    },
  },
  focusAliasIconActivePseudoHover: {
    color: {
      ":focus:hover": $colors.labelTitle,
    },
  },
});
