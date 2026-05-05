// Empty styled wrappers around custom functions must not emit references to missing generated bases.
import * as React from "react";
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

const ConvertedShell = styled.div`
  padding: 12px;
  border: 1px solid #94a3b8;
`;

export const App = () => (
  <ConvertedShell>
    <Notice>Notice</Notice>
  </ConvertedShell>
);
