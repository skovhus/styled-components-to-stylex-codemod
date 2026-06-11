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

  it("detects styled-dependent static members behind a clean export root", () => {
    const source = `
const SelectBase = (props) => <div>{props.children}</div>;

const StyledOptionRoot = styled.div\`
  color: red;
\`;
const SelectOption = (props) => <StyledOptionRoot>{props.children}</StyledOptionRoot>;

const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };
CustomSelect.Option = SelectOption;

export const ContentViewContainer = CustomSelect;
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledOptionRoot"]),
        memberPath: ["Option"],
      }),
    ).toBe(true);
    // The root binding itself stays independent — the dependency is member-specific.
    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledOptionRoot"]),
      }),
    ).toBe(false);
  });

  it("proves static members independent when their assigned value avoids styled definitions", () => {
    const source = `
const SelectBase = (props) => <div>{props.children}</div>;

const StyledOther = styled.div\`
  color: red;
\`;
const SelectOption = (props) => <div>{props.children}</div>;

const CustomSelect = SelectBase as typeof SelectBase & { Option: typeof SelectOption };
CustomSelect.Option = SelectOption;

export const ContentViewContainer = CustomSelect;
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledOther"]),
        memberPath: ["Option"],
      }),
    ).toBe(false);
  });

  it("resolves static members declared via Object.assign initializers", () => {
    const source = `
const SelectBase = (props) => <div>{props.children}</div>;

const StyledOptionRoot = styled.div\`
  color: red;
\`;
const SelectOption = (props) => <StyledOptionRoot>{props.children}</StyledOptionRoot>;

export const ContentViewContainer = Object.assign(SelectBase, { Option: SelectOption });
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledOptionRoot"]),
        memberPath: ["Option"],
      }),
    ).toBe(true);
  });

  it("stays conservative when a static member assignment cannot be located", () => {
    const source = `
const SelectBase = (props) => <div>{props.children}</div>;

const StyledOptionRoot = styled.div\`
  color: red;
\`;

export const ContentViewContainer = SelectBase;
`;

    expect(
      exportedBindingDependsOnLocalNames({
        source,
        exportedName: "ContentViewContainer",
        includeDefault: false,
        localNames: new Set(["StyledOptionRoot"]),
        memberPath: ["Option"],
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
