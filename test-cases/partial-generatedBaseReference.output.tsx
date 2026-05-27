// Empty styled wrappers around custom functions must not emit references to missing generated bases.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

function observe<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  return Component;
}

type NoticeProps = {
  children?: React.ReactNode;
  className?: string;
};

export const Notice = styled(
  observe(function NoticeBase(props: NoticeProps) {
    const { children, className } = props;
    return <div className={className}>{children}</div>;
  }),
)``;

export const App = () => (
  <div sx={styles.convertedShell}>
    <Notice>Notice</Notice>
  </div>
);

const styles = stylex.create({
  convertedShell: {
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#94a3b8",
  },
});
