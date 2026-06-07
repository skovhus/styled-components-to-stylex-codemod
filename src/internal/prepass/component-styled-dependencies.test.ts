import { describe, expect, it } from "vitest";

import {
  exportedBindingDependsOnLocalNames,
  localNamesForExport,
} from "./component-styled-dependencies.js";

describe("component styled dependency helpers", () => {
  it("resolves named export aliases to local bindings", () => {
    const source = `
const InternalBox = styled.div\`
  color: red;
\`;

export { InternalBox as PublicBox };
`;

    expect(localNamesForExport(source, "PublicBox", false)).toEqual(["InternalBox"]);
  });

  it("resolves variable export aliases to their local targets", () => {
    const source = `
const InternalBox = styled.div\`
  color: red;
\`;

export const PublicBox = InternalBox;
`;

    expect(new Set(localNamesForExport(source, "PublicBox", false))).toEqual(
      new Set(["PublicBox", "InternalBox"]),
    );
  });

  it("does not treat TypeScript prop types as styled-component dependencies", () => {
    const source = `
type Props = {
  StyledHeader?: string;
};

export function ContentViewContainer(props: Props) {
  return <section title={props.StyledHeader} />;
}
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledHeader"]),
      }),
    ).toBe(false);
  });

  it("detects exported function components that render styled definitions", () => {
    const source = `
const StyledHeader = styled.div\`
  color: red;
\`;

export function GroupHeader() {
  return <StyledHeader />;
}
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "GroupHeader",
        includeDefault: false,
        localNames: new Set(["StyledHeader"]),
      }),
    ).toBe(true);
  });

  it("detects exported components that render styled definitions through local aliases", () => {
    const source = `
const StyledHeader = styled.div\`
  color: red;
\`;

const Header = StyledHeader;

export function GroupHeader() {
  return <Header />;
}
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "GroupHeader",
        includeDefault: false,
        localNames: new Set(["StyledHeader"]),
      }),
    ).toBe(true);
  });

  it("detects anonymous default exports that render styled definitions", () => {
    const source = `
const StyledHeader = styled.div\`
  color: red;
\`;

export default function() {
  return <StyledHeader />;
}
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "default",
        includeDefault: true,
        localNames: new Set(["StyledHeader"]),
      }),
    ).toBe(true);
  });
});
