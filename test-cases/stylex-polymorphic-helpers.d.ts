import type * as React from "react";

export type FastOmit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
export type Substitute<A, B> = FastOmit<A, keyof B> & B;

export type PolymorphicAsProps<
  C extends React.ElementType,
  BaseProps,
  Omitted extends keyof any = never,
  ExtraProps = {},
> = BaseProps &
  FastOmit<React.ComponentPropsWithRef<C>, keyof BaseProps | Omitted> & {
    as?: C;
  } & ExtraProps;

export type DelegatingPolymorphicProps<
  C extends React.ElementType,
  BaseProps,
  BaseOmitted extends keyof any = never,
  TargetOmitted extends keyof any = never,
  ExtraProps = {},
> = PolymorphicAsProps<C, FastOmit<BaseProps, BaseOmitted>, TargetOmitted, ExtraProps>;
