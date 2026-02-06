// @expected-warning: Unsupported selector: interpolated pseudo selector
import styled, { css } from "styled-components";
import { Text } from "./lib/text";
import { ExternalComponent as Link } from "./lib/external-component";

const highlight = "hover";

const styles = css`
  transition-property: background-color, border-color;
  transition-duration: 0s;
  padding: 3px 5px;
  margin: -3px -5px;
  border-radius: 3px;
  line-height: 18px;
  min-width: 0;

  // prettier-ignore
  &:${highlight} {
    background-color: ${(props) => props.theme.color.bgBorderFaint};
    transition-duration: 0s;
  }
`;

/** Highlight text that is used in hoverable popovers */
export const PopoverHighlightText = styled(Text)`
  ${styles}
`;

/** Highlight link that is used in hoverable popovers to indicate a clickable element */
export const PopoverHighlightLink = styled(Link)`
  ${styles}
`;
