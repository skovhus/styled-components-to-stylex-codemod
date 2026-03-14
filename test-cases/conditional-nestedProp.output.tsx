import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export enum Role {
  admin = "admin",
  user = "user",
}

type User = {
  role: Role;
  name: string;
};

type BadgeProps = { user: User } & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Badge(props: BadgeProps) {
  const { children, user, ...rest } = props;
  return (
    <div {...rest} sx={user.role === Role.admin && styles.badgeUserRoleAdmin}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div>
      <Badge user={{ role: Role.admin, name: "Ada" }}>Admin</Badge>
      <Badge user={{ role: Role.user, name: "Bob" }}>User</Badge>
    </div>
  );
}

const styles = stylex.create({
  badgeUserRoleAdmin: {
    color: "red",
  },
});
