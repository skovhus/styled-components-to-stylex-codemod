// Ternary that returns multi-line CSS blocks (multiple declarations per branch).
import * as React from "react";
import styled from "styled-components";
import { flexCenter } from "./lib/helpers";

const Text = (
  props: React.ComponentProps<"span"> & {
    column?: boolean;
    color?: "base" | "muted";
    gap?: number;
    variant?: "small" | "medium";
  },
) => {
  const { column, color, gap, variant, ...rest } = props;
  return (
    <span data-column={column} data-color={color} data-gap={gap} data-variant={variant} {...rest} />
  );
};

const ErrorMessage = styled.div<{ $inline?: boolean }>`
  color: red;
  font-size: 12px;
  ${(props) =>
    props.$inline === true
      ? `padding: 0 6px;
         border-radius: 4px;
         position: absolute;
         right: 4px;
         top: 4px;`
      : `margin-top: 8px;
         padding: 4px 0;
         border-top: 1px solid red;`}
`;

const StyledText = styled(Text).attrs({ gap: 16, column: true })<{
  $addBottomBorder?: boolean;
  $hasSubtitle: boolean;
}>`
  margin-bottom: 8px;
  ${(props) =>
    props.$addBottomBorder
      ? `
      border-bottom: 1px solid ${props.theme.color.bgBorderSolid};
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const OrderedBox = styled.div<{ $add?: boolean; $warn?: boolean; $hasSubtitle: boolean }>`
  padding: 8px;
  ${(props) => (props.$add ? "color: red;" : "")}
  ${(props) => (props.$warn ? "color: green;" : "")}
  ${(props) =>
    props.$add
      ? `
      color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const SplitOrderBox = styled.div<{ $add?: boolean; $warn?: boolean; $hasSubtitle: boolean }>`
  padding: 8px;
  ${(props) =>
    props.$add && props.$hasSubtitle
      ? `
      color: red;
      padding-bottom: 20px;
    `
      : ""}
  ${(props) => (props.$warn ? "color: green;" : "")}
  ${(props) =>
    props.$add && !props.$hasSubtitle
      ? `
      color: red;
      padding-bottom: 40px;
    `
      : ""}
`;

const DynamicOrderBox = styled.div<{ $add?: boolean; $warnColor?: string; $hasSubtitle: boolean }>`
  padding: 8px;
  ${(props) =>
    props.$add && props.$hasSubtitle
      ? `
      color: red;
      padding-bottom: 20px;
    `
      : ""}
  ${(props) => (props.$warnColor ? `color: ${props.$warnColor};` : "")}
  ${(props) =>
    props.$add && !props.$hasSubtitle
      ? `
      color: red;
      padding-bottom: 40px;
    `
      : ""}
`;

const StyleFnParentBox = styled.div<{
  $add?: boolean;
  $warn?: boolean;
  $hasSubtitle: boolean;
  $width: number;
}>`
  padding: 8px;
  ${(props) => (props.$add ? `width: ${props.$width}px;` : "")}
  ${(props) => (props.$warn ? "color: green;" : "")}
  ${(props) =>
    props.$add
      ? `
      color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const InverseMergeBox = styled.div<{
  tone: "primary" | "secondary";
  $warn?: boolean;
  $hasSubtitle: boolean;
}>`
  padding: 8px;
  ${(props) =>
    props.tone === "primary"
      ? `
      color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
  ${(props) => (props.$warn ? "color: green;" : "")}
  ${(props) => (props.tone !== "primary" ? "color: blue;" : "")}
`;

const GroupedInverseBox = styled.div<{ $add?: boolean; $hasSubtitle: boolean }>`
  padding: 8px;
  ${(props) => (!props.$add ? "color: blue;" : "")}
  ${(props) =>
    props.$add
      ? `
      color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const KeyCollisionBox = styled.div<{
  $foo?: boolean;
  $bar?: boolean;
  $fooBar?: boolean;
  $baz: boolean;
}>`
  padding: 8px;
  ${(props) => (props.$fooBar ? "color: blue;" : "")}
  ${(props) =>
    props.$foo && props.$bar
      ? `
      color: red;
      ${props.$baz ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const StyleFnKeyCollisionBox = styled.div<{
  $color?: string;
  $hasSubtitle: boolean;
}>`
  padding: 8px;
  color: ${(props) => props.$color};
  ${(props) =>
    props.$color
      ? `
      border-color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

const AfterBaseCollisionBox = styled.div<{ $after1?: boolean; $hasSubtitle: boolean }>`
  padding: 8px;
  ${flexCenter()}
  background: white;
  ${(props) =>
    props.$after1
      ? `
      color: red;
      ${props.$hasSubtitle ? "padding-bottom: 20px;" : "padding-bottom: 40px;"}
    `
      : ""}
`;

export const App = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: "16px",
      position: "relative",
    }}
  >
    <ErrorMessage $inline>Inline error</ErrorMessage>
    <ErrorMessage $inline={false}>Block error</ErrorMessage>
    <StyledText variant="small" color="muted" $hasSubtitle={false}>
      No bottom border
    </StyledText>
    <StyledText variant="small" color="muted" $addBottomBorder $hasSubtitle>
      Border with subtitle
    </StyledText>
    <StyledText variant="small" color="muted" $addBottomBorder $hasSubtitle={false}>
      Border without subtitle
    </StyledText>
    <OrderedBox $add $warn $hasSubtitle>
      Add + warn + subtitle stays red
    </OrderedBox>
    <OrderedBox $add $warn $hasSubtitle={false}>
      Add + warn + no subtitle stays red
    </OrderedBox>
    <SplitOrderBox $add $warn $hasSubtitle>
      Split order subtitle stays green
    </SplitOrderBox>
    <SplitOrderBox $add $warn $hasSubtitle={false}>
      Split order no subtitle stays red
    </SplitOrderBox>
    <DynamicOrderBox $add $warnColor="green" $hasSubtitle>
      Dynamic order subtitle stays green
    </DynamicOrderBox>
    <DynamicOrderBox $add $warnColor="green" $hasSubtitle={false}>
      Dynamic order no subtitle stays red
    </DynamicOrderBox>
    <StyleFnParentBox $add $warn $hasSubtitle $width={80}>
      Style fn parent subtitle stays red
    </StyleFnParentBox>
    <StyleFnParentBox $add $warn $hasSubtitle={false} $width={80}>
      Style fn parent no subtitle stays red
    </StyleFnParentBox>
    <InverseMergeBox tone="primary" $warn $hasSubtitle>
      Primary inverse subtitle stays green
    </InverseMergeBox>
    <InverseMergeBox tone="primary" $warn $hasSubtitle={false}>
      Primary inverse no subtitle stays green
    </InverseMergeBox>
    <InverseMergeBox tone="secondary" $warn={false} $hasSubtitle>
      Secondary inverse stays blue
    </InverseMergeBox>
    <GroupedInverseBox $add $hasSubtitle>
      Grouped inverse subtitle stays red
    </GroupedInverseBox>
    <GroupedInverseBox $add $hasSubtitle={false}>
      Grouped inverse no subtitle stays red
    </GroupedInverseBox>
    <GroupedInverseBox $add={false} $hasSubtitle>
      Grouped inverse no add stays blue
    </GroupedInverseBox>
    <KeyCollisionBox $foo $bar $baz $fooBar={false}>
      Key collision factored branch stays red
    </KeyCollisionBox>
    <KeyCollisionBox $foo={false} $bar={false} $baz={false} $fooBar>
      Key collision existing prop stays blue
    </KeyCollisionBox>
    <StyleFnKeyCollisionBox $color="green" $hasSubtitle>
      Style fn key collision keeps green text
    </StyleFnKeyCollisionBox>
    <StyleFnKeyCollisionBox $color="green" $hasSubtitle={false}>
      Style fn key collision no subtitle keeps green text
    </StyleFnKeyCollisionBox>
    <AfterBaseCollisionBox $after1 $hasSubtitle>
      After-base key collision subtitle stays red
    </AfterBaseCollisionBox>
    <AfterBaseCollisionBox $after1 $hasSubtitle={false}>
      After-base key collision no subtitle stays red
    </AfterBaseCollisionBox>
  </div>
);
