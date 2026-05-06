import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: string;
}>;

// Forward descendant selector with prop-based interpolation.
// The prop value is bridged to the child via a CSS custom property.
function Button(props: ButtonProps) {
  const { children, color } = props;
  const sx = stylex.props(styles.button, stylex.defaultMarker());

  return (
    <button
      {...sx}
      style={
        {
          ...sx.style,
          "--iconInButton-hover-color": props.color ?? "red",
        } as React.CSSProperties
      }
    >
      {children}
    </button>
  );
}

type CardProps = React.PropsWithChildren<{
  shadow?: string;
}>;

function Card(props: CardProps) {
  const { children, shadow } = props;
  const sx = stylex.props(styles.card, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--badgeInCard-hover-boxShadow": props.shadow ?? "rgba(0,0,0,0.2)",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ToolbarProps = React.PropsWithChildren<{
  accent?: string;
}>;

function Toolbar(props: ToolbarProps) {
  const { children, accent } = props;
  const sx = stylex.props(styles.toolbar, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--tagInToolbar-hover-border": props.accent ?? "gray",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ToggleProps = React.PropsWithChildren<{
  hoverColor?: string;
  focusColor?: string;
}>;

function Toggle(props: ToggleProps) {
  const { children, hoverColor, focusColor } = props;
  const sx = stylex.props(styles.toggle, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--dotInToggle-hover-color": props.hoverColor ?? "blue",
          "--dotInToggle-focus-color": props.focusColor ?? "green",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ChipGroupProps = React.PropsWithChildren<{
  chipColor?: string;
}>;

function ChipGroup(props: ChipGroupProps) {
  const { children, chipColor } = props;
  const sx = stylex.props(styles.chipGroup, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--chipInChipGroup-hover-color": props.chipColor ?? "purple",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type GroupedPanelProps = React.PropsWithChildren<{
  tone?: string;
}>;

function GroupedPanel(props: GroupedPanelProps) {
  const { children, tone } = props;
  const sx = stylex.props(styles.groupedPanel, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--groupedLabelInGroupedPanel-hover-color": props.tone ?? "darkgreen",
          "--groupedLabelInGroupedPanel-focusWithin-color": props.tone ?? "darkgreen",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ScrollerProps = React.PropsWithChildren<{
  minContentWidth: number;
}>;

function Scroller(props: ScrollerProps) {
  const { children, minContentWidth } = props;
  const sx = stylex.props(styles.scroller);

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--stickyHeaderInScroller-minWidth": props.minContentWidth,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Button color="blue">
      <span sx={[styles.icon, styles.iconInButton]} />
      Button hover → Icon color
    </Button>
    <Card shadow="rgba(0,0,255,0.3)">
      <span sx={[styles.badge, styles.badgeInCard]}>Card hover → Badge shadow</span>
    </Card>
    <Toolbar accent="red">
      <span sx={[styles.tag, styles.tagInToolbar]}>Toolbar hover → Tag border</span>
    </Toolbar>
    <Toggle hoverColor="red" focusColor="orange">
      <span sx={[styles.dot, styles.dotInToggle]}>Hover vs Focus</span>
    </Toggle>
    <ChipGroup chipColor="teal">
      <span sx={[styles.chip, styles.chipInChipGroup]}>Destructured prop</span>
    </ChipGroup>
    <GroupedPanel tone="seagreen">
      <button type="button">
        <span sx={[styles.groupedLabel, styles.groupedLabelInGroupedPanel]}>
          Grouped hover/focus dynamic color
        </span>
      </button>
    </GroupedPanel>
    <Scroller minContentWidth={320}>
      <div sx={[styles.stickyHeader, styles.stickyHeaderInScroller]}>Dynamic descendant width</div>
    </Scroller>
  </div>
);

const styles = stylex.create({
  icon: {
    width: 16,
    height: 16,
  },
  button: {
    padding: 8,
  },
  // Static parts around the interpolation must be preserved in the var() reference
  // (e.g., `box-shadow: 0 4px 8px ${color}` → `"0 4px 8px var(--name)"`).
  badge: {
    fontSize: 12,
  },
  card: {
    padding: 16,
    backgroundColor: "white",
  },
  // Shorthand border with interpolation: static longhands stay static,
  // dynamic color is bridged via CSS variable.
  tag: {
    display: "inline-block",
  },
  toolbar: {
    display: "flex",
    gap: 8,
  },
  // Multiple pseudo selectors targeting the same child with the same CSS property
  // must produce unique CSS variable names per pseudo to avoid collisions.
  dot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    backgroundColor: "gray",
  },
  toggle: {
    padding: 8,
  },
  // Destructured arrow params must also register shouldForwardProp drops
  chip: {
    fontSize: 14,
  },
  chipGroup: {
    display: "flex",
    gap: 4,
  },
  // Grouped parent pseudos must bridge the dynamic value into every pseudo bucket.
  groupedLabel: {
    fontSize: 14,
  },
  groupedPanel: {
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
  },
  scroller: {
    overflow: "auto",
  },
  iconInButton: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--iconInButton-hover-color)",
    },
  },
  badgeInCard: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: "0 4px 8px var(--badgeInCard-hover-boxShadow)",
    },
  },
  tagInToolbar: {
    borderWidth: {
      default: null,
      [stylex.when.ancestor(":hover")]: 2,
    },
    borderStyle: {
      default: null,
      [stylex.when.ancestor(":hover")]: "solid",
    },
    borderColor: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--tagInToolbar-hover-border)",
    },
  },
  dotInToggle: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--dotInToggle-hover-color)",
      [stylex.when.ancestor(":focus")]: "var(--dotInToggle-focus-color)",
    },
  },
  chipInChipGroup: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--chipInChipGroup-hover-color)",
    },
  },
  groupedLabelInGroupedPanel: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--groupedLabelInGroupedPanel-hover-color)",
      [stylex.when.ancestor(":focus-within")]:
        "var(--groupedLabelInGroupedPanel-focusWithin-color)",
    },
  },
  stickyHeaderInScroller: {
    minWidth: "calc(var(--stickyHeaderInScroller-minWidth) * 1px)",
  },
});
