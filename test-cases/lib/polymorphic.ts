import type * as React from "react";

type FastOmit<T extends object, U extends string | number | symbol> = {
  [K in keyof T as K extends U ? never : K]: T[K];
};

type Substitute<A extends object, B extends object> = FastOmit<A, keyof B> & B;

/**
 * Polymorphic component props combiner modeled after styled-components' PolymorphicComponentProps.
 *
 * Uses Substitute to ensure AsTarget element props override BaseProps for overlapping keys
 * (e.g., onChange is typed for the target element, not the base component's default element).
 *
 * @typeParam BaseProps - The base component's full props (including HTML element props)
 * @typeParam AsTarget  - The element type provided via the `as` prop
 */
export type PolymorphicComponentProps<
  BaseProps extends object,
  AsTarget extends React.ElementType,
  _AsTargetProps extends object = React.ComponentPropsWithRef<AsTarget>,
> = FastOmit<Substitute<BaseProps, _AsTargetProps>, "as"> & { as?: AsTarget };
