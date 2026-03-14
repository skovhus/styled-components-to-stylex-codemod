import * as React from "react";
import * as stylex from "@stylexjs/stylex";

function Link(props: Pick<React.ComponentProps<"a">, "children" | "href">) {
  const { children, ...rest } = props;
  return (
    <a {...rest} sx={[styles.link, stylex.defaultMarker()]}>
      {children}
    </a>
  );
}

type BadgeProps = React.PropsWithChildren<{
  active?: boolean;
}>;

function Badge(props: BadgeProps) {
  const { children, active } = props;
  return (
    <span
      sx={styles.badge({
        color: active ? "green" : "gray",
      })}
    >
      {children}
    </span>
  );
}

type TagProps = React.PropsWithChildren<{
  highlighted?: boolean;
}>;

// Static declarations after an unresolvable interpolation must be preserved
function Tag(props: TagProps) {
  const { children, highlighted } = props;
  return (
    <span
      sx={styles.tag({
        color: highlighted ? "blue" : "inherit",
      })}
    >
      {children}
    </span>
  );
}

type CardProps = React.PropsWithChildren<{
  accent?: boolean;
}>;

// Shorthand border with interpolation: static longhands (width, style) must stay static
function Card(props: CardProps) {
  const { children, accent } = props;
  return (
    <div
      sx={styles.card({
        borderColor: accent ? "red" : "transparent",
      })}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Link href="#">
      <Badge active>Active</Badge>
    </Link>
    <Link href="#">
      <Badge>Inactive</Badge>
    </Link>
    <Link href="#">
      <Tag highlighted>Highlighted</Tag>
    </Link>
    <Link href="#">
      <Tag>Normal</Tag>
    </Link>
    <Link href="#">
      <Card accent>Accent Card</Card>
    </Link>
    <Link href="#">
      <Card>Default Card</Card>
    </Link>
  </div>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: 8,
    backgroundColor: "papayawhip",
  },
  badge: (props: { color: string }) => ({
    paddingBlock: 4,
    paddingInline: 8,
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: props.color,
    },
  }),
  tag: (props: { color: string }) => ({
    fontSize: 12,
    fontWeight: {
      default: null,
      [stylex.when.ancestor(":hover")]: 700,
    },
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: props.color,
    },
  }),
  card: (props: { borderColor: string }) => ({
    padding: 8,
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
      [stylex.when.ancestor(":hover")]: props.borderColor,
    },
  }),
});
