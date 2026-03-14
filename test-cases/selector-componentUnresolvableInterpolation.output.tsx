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

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Link href="#">
      <Badge active>Active</Badge>
    </Link>
    <Link href="#">
      <Badge>Inactive</Badge>
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
});
