import * as React from "react";
import styled from "styled-components";

export enum Role {
  admin = "admin",
  user = "user",
}

type User = {
  role: Role;
  name: string;
};

export const Badge = styled.div<{ user: User }>`
  ${(props) =>
    props.user.role === Role.admin
      ? `
    color: red;
  `
      : ``}
`;

export function App() {
  return (
    <div>
      <Badge user={{ role: Role.admin, name: "Ada" }}>Admin</Badge>
      <Badge user={{ role: Role.user, name: "Bob" }}>User</Badge>
    </div>
  );
}
