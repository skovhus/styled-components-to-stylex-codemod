import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWrappedComponentSxAware } from "./wrapped-component-interface.js";
import { toRealPath } from "./utilities/path-utils.js";

let dir: string;

function writeLib(name: string, source: string): string {
  const filePath = join(dir, `${name}.tsx`);
  writeFileSync(filePath, source, "utf8");
  return filePath;
}

function writeFile(relativePath: string, source: string): string {
  const filePath = join(dir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, source, "utf8");
  return filePath;
}

function check(componentLocalName: string, libPath: string): boolean {
  return isWrappedComponentSxAware({
    adapter: { useSxProp: true },
    importMap: new Map([
      [
        componentLocalName,
        {
          importedName: componentLocalName,
          source: { kind: "absolutePath", value: libPath.replace(/\.(tsx|ts|jsx|js)$/, "") },
        },
      ],
    ]),
    componentLocalName,
    filePath: join(dir, "consumer.tsx"),
  });
}

function checkWithAdapter(args: {
  componentLocalName: string;
  libPath: string;
  wrappedComponentInterface?: () => { acceptsSx: boolean } | undefined;
  useSxProp?: boolean;
}): boolean {
  const { componentLocalName, libPath, wrappedComponentInterface, useSxProp = true } = args;
  return isWrappedComponentSxAware({
    adapter: { useSxProp, wrappedComponentInterface },
    importMap: new Map([
      [
        componentLocalName,
        {
          importedName: componentLocalName,
          source: { kind: "absolutePath", value: libPath.replace(/\.(tsx|ts|jsx|js)$/, "") },
        },
      ],
    ]),
    componentLocalName,
    filePath: join(dir, "consumer.tsx"),
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sx-aware-detection-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("isWrappedComponentSxAware — positive: prop type signatures", () => {
  it("detects sx on a function declaration with an inline literal prop type", () => {
    const lib = writeLib(
      "fnDecl",
      `
import * as stylex from "@stylexjs/stylex";

export function SxAwareButton(props: { sx?: stylex.StyleXStyles; className?: string }) {
  return null as any;
}
`,
    );
    expect(check("SxAwareButton", lib)).toBe(true);
  });

  it("detects sx on an arrow function assigned to const", () => {
    const lib = writeLib(
      "arrow",
      `
import * as stylex from "@stylexjs/stylex";

export const Card = (props: { sx?: stylex.StyleXStyles }) => null as any;
`,
    );
    expect(check("Card", lib)).toBe(true);
  });

  it("detects sx on a function expression assigned to const", () => {
    const lib = writeLib(
      "fnExpr",
      `
import * as stylex from "@stylexjs/stylex";

export const Card = function (props: { sx?: stylex.StyleXStyles }) {
  return null as any;
};
`,
    );
    expect(check("Card", lib)).toBe(true);
  });

  it("detects sx whether or not the file marks the component as exported", () => {
    // Detection only cares that the named declaration exists in the file —
    // the import in the consumer is what determines "exported" semantics.
    const lib = writeLib(
      "noexport",
      `
import * as stylex from "@stylexjs/stylex";

function Local(props: { sx?: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("Local", lib)).toBe(true);
  });

  it("detects sx when declared as required (not optional)", () => {
    const lib = writeLib(
      "required",
      `
import * as stylex from "@stylexjs/stylex";

export function MustSx(props: { sx: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("MustSx", lib)).toBe(true);
  });

  it("detects sx declared with a string-literal key", () => {
    const lib = writeLib(
      "stringKey",
      `
import * as stylex from "@stylexjs/stylex";

export function StringKey(props: { "sx"?: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("StringKey", lib)).toBe(true);
  });

  it("detects sx regardless of the prop type's actual value type", () => {
    // The detector only checks for an `sx` key — it doesn't care whether the
    // value is `StyleXStyles`, `unknown`, or something else entirely. That's
    // intentional: the codemod isn't validating the user's library, only
    // recognising the convention.
    const lib = writeLib(
      "anyValue",
      `
export function Whatever(props: { sx?: any }) { return null as any; }
`,
    );
    expect(check("Whatever", lib)).toBe(true);
  });

  it("detects sx on a default-exported function declaration", () => {
    const lib = writeLib(
      "defaultExport",
      `
import * as stylex from "@stylexjs/stylex";

export default function Default(props: { sx?: stylex.StyleXStyles }) {
  return null as any;
}
`,
    );
    // Consumer imports as default: importMap stores importedName="default",
    // local name "Default" matches the function declaration in the file.
    expect(check("Default", lib)).toBe(true);
  });

  it("detects sx through a package export that resolves to source on disk", () => {
    writeFile(
      "node_modules/@company/ui/package.json",
      JSON.stringify({
        name: "@company/ui",
        type: "module",
        exports: {
          "./components/Text": "./src/Text.tsx",
        },
      }),
    );
    writeFile(
      "node_modules/@company/ui/src/Text.tsx",
      `
import * as stylex from "@stylexjs/stylex";

type TextComponentProps = { sx?: stylex.StyleXStyles; children?: React.ReactNode };

export function Text(props: TextComponentProps) {
  return null as any;
}
`,
    );
    const consumerPath = writeFile("consumer.tsx", "");

    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map([
          [
            "Text",
            {
              importedName: "Text",
              source: { kind: "specifier", value: "@company/ui/components/Text" },
            },
          ],
        ]),
        componentLocalName: "Text",
        filePath: consumerPath,
      }),
    ).toBe(true);
  });
});

describe("isWrappedComponentSxAware — positive: type alias / interface resolution", () => {
  it("resolves a single type-alias hop to its inline literal", () => {
    const lib = writeLib(
      "aliasOne",
      `
import * as stylex from "@stylexjs/stylex";

type Props = { sx?: stylex.StyleXStyles };

export function Foo(props: Props) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(true);
  });

  it("resolves an intersection of type aliases (Text-style generic component)", () => {
    const lib = writeLib(
      "textIntersection",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TextProps = { size?: "sm" | "md" };

type TextComponentProps<C extends React.ElementType> = TextProps &
  Omit<React.ComponentPropsWithRef<C>, keyof TextProps> & { sx?: stylex.StyleXStyles; as?: C };

export function Text<C extends React.ElementType = "span">(props: TextComponentProps<C>) {
  return null as any;
}
`,
    );
    expect(check("Text", lib)).toBe(true);
  });

  it("resolves nested type-alias chains until it finds sx", () => {
    const lib = writeLib(
      "chain",
      `
import * as stylex from "@stylexjs/stylex";

type Inner = { sx?: stylex.StyleXStyles };
type Middle = Inner;
type Outer = Middle & { id?: string };

export function Foo(props: Outer) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(true);
  });

  it("resolves an interface-typed prop type containing sx", () => {
    const lib = writeLib(
      "iface",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface CardProps {
  sx?: stylex.StyleXStyles;
  children?: React.ReactNode;
}

export const Card = (props: CardProps) => null as any;
`,
    );
    expect(check("Card", lib)).toBe(true);
  });

  it("walks unions (one branch has sx)", () => {
    const lib = writeLib(
      "union",
      `
import * as stylex from "@stylexjs/stylex";

type Props =
  | { kind: "icon"; name: string }
  | { kind: "styled"; sx?: stylex.StyleXStyles };

export function Either(props: Props) { return null as any; }
`,
    );
    // Union short-circuits on the first branch that contains `sx`. Note that
    // semantically `sx` here is only available in the discriminated branch;
    // the codemod's contract is just "the type mentions sx", not "all callers
    // can pass sx". Documented behaviour.
    expect(check("Either", lib)).toBe(true);
  });

  it("descends through TSParenthesizedType wrappers", () => {
    const lib = writeLib(
      "paren",
      `
import * as stylex from "@stylexjs/stylex";

export function Foo(props: ({ sx?: stylex.StyleXStyles })) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(true);
  });

  it("does not infinite-loop on cyclic type aliases", () => {
    const lib = writeLib(
      "cycle",
      `
import * as stylex from "@stylexjs/stylex";

type A = A & { sx?: stylex.StyleXStyles };

export function Cyclic(props: A) { return null as any; }
`,
    );
    // The literal branch of the intersection still produces a hit before the
    // self-referential branch is re-entered.
    expect(check("Cyclic", lib)).toBe(true);
  });
});

describe("isWrappedComponentSxAware — negative: sx absent or out of reach", () => {
  it("returns false for a plain component without sx", () => {
    const lib = writeLib(
      "plain",
      `
export function PlainButton(props: { className?: string }) { return null as any; }
`,
    );
    expect(check("PlainButton", lib)).toBe(false);
  });

  it("returns false when sx appears as an Omit utility argument", () => {
    const lib = writeLib(
      "omit",
      `
import * as React from "react";

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "sx"> & {
  variant?: "primary" | "secondary";
};

export const Button = (props: ButtonProps) => null as any;
`,
    );
    expect(check("Button", lib)).toBe(false);
  });

  it("returns false when sx appears as a Pick utility argument", () => {
    const lib = writeLib(
      "pick",
      `
import * as React from "react";

type Big = { sx?: number; other?: number };
export type Narrow = Pick<Big, "other">;

export const Pickn = (props: Narrow) => null as any;
`,
    );
    expect(check("Pickn", lib)).toBe(false);
  });

  it("returns false when sx is a string literal value of an unrelated prop", () => {
    const lib = writeLib(
      "stringValue",
      `
export type Props = { variant?: "sx-like" | "other" };

export const Weird = (props: Props) => null as any;
`,
    );
    expect(check("Weird", lib)).toBe(false);
  });

  it("returns false when sx appears only inside a comment in the file", () => {
    const lib = writeLib(
      "comment",
      `
// This component has no sx prop. The string "sx" appears only here.
export function NoSx(props: { id?: string }) { return null as any; }
`,
    );
    expect(check("NoSx", lib)).toBe(false);
  });

  it("returns false when the named component has no parameters", () => {
    const lib = writeLib(
      "noParams",
      `
export function Empty() { return null as any; }
`,
    );
    expect(check("Empty", lib)).toBe(false);
  });

  it("returns false when the parameter has no type annotation", () => {
    const lib = writeLib(
      "untyped",
      `
export function Untyped(props) { return null as any; }
`,
    );
    expect(check("Untyped", lib)).toBe(false);
  });

  it("returns false when sx is on a sibling component in the same file", () => {
    const lib = writeLib(
      "siblingSx",
      `
import * as stylex from "@stylexjs/stylex";

export function Other(props: { sx?: stylex.StyleXStyles }) { return null as any; }
export function Target(props: { className?: string }) { return null as any; }
`,
    );
    expect(check("Target", lib)).toBe(false);
    expect(check("Other", lib)).toBe(true);
  });

  it("returns false when the component's local name does not exist in the file", () => {
    const lib = writeLib(
      "missingName",
      `
import * as stylex from "@stylexjs/stylex";
export function Foo(props: { sx?: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("DoesNotExist", lib)).toBe(false);
  });

  it("returns false for unresolvable package-style imports", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map([
          [
            "ExternalButton",
            {
              importedName: "ExternalButton",
              source: { kind: "specifier", value: "@company/ui" },
            },
          ],
        ]),
        componentLocalName: "ExternalButton",
        filePath: "/anywhere/consumer.tsx",
      }),
    ).toBe(false);
  });
});

describe("isWrappedComponentSxAware — negative: known limitations of the static walker", () => {
  // The cases below document patterns the walker intentionally does NOT support
  // today. They return false. Use the `wrappedComponentInterface` adapter hook
  // to opt them in explicitly.

  it("does not detect sx declared via React.FC generic on the variable annotation", () => {
    // The type sits on the variable's `id`, not on the arrow's first parameter.
    const lib = writeLib(
      "reactFC",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Props = { sx?: stylex.StyleXStyles };

export const Foo: React.FC<Props> = (props) => null as any;
`,
    );
    expect(check("Foo", lib)).toBe(false);
  });

  it("does not detect sx through a forwardRef HOC wrapper", () => {
    const lib = writeLib(
      "forwardRef",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Props = { sx?: stylex.StyleXStyles };

export const Foo = React.forwardRef<HTMLButtonElement, Props>((props, ref) => null as any);
`,
    );
    expect(check("Foo", lib)).toBe(false);
  });

  it("does not follow an interface's `extends` clause", () => {
    const lib = writeLib(
      "extendsClause",
      `
import * as stylex from "@stylexjs/stylex";

interface Base { sx?: stylex.StyleXStyles }
interface Props extends Base { id?: string }

export function Foo(props: Props) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(false);
  });

  it("does not follow type imports across files", () => {
    writeLib(
      "typeOnly",
      `
import * as stylex from "@stylexjs/stylex";
export type ExternalProps = { sx?: stylex.StyleXStyles };
`,
    );
    const lib = writeLib(
      "consumer",
      `
import type { ExternalProps } from "./typeOnly";
export function Foo(props: ExternalProps) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(false);
  });
});

describe("isWrappedComponentSxAware — file-system edge cases", () => {
  it("returns false when the imported file does not exist on disk", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map([
          [
            "Ghost",
            {
              importedName: "Ghost",
              source: {
                kind: "absolutePath",
                value: join(dir, "does-not-exist"),
              },
            },
          ],
        ]),
        componentLocalName: "Ghost",
        filePath: join(dir, "consumer.tsx"),
      }),
    ).toBe(false);
  });

  it("returns false on an empty file", () => {
    const lib = writeLib("empty", "");
    expect(check("Anything", lib)).toBe(false);
  });

  it("returns false when the source has a syntax error (no throw)", () => {
    const lib = writeLib(
      "broken",
      `
import * as stylex from "@stylexjs/stylex";
export function Foo(props: { sx?: stylex.StyleXStyles {  // <-- malformed
`,
    );
    expect(() => check("Foo", lib)).not.toThrow();
    expect(check("Foo", lib)).toBe(false);
  });

  it("resolves bare absolute paths by trying common extensions (.tsx, .ts, .jsx, .js)", () => {
    // `writeLib` writes a `.tsx` file but the importMap stores the bare path
    // (no extension) — same convention used by the production import map.
    const lib = writeLib(
      "ext",
      `
import * as stylex from "@stylexjs/stylex";
export function Foo(props: { sx?: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(true);
  });
});

describe("isWrappedComponentSxAware — adapter override semantics", () => {
  it("adapter override forcing true wins over a non-sx-aware file", () => {
    const lib = writeLib("plain", `export const Foo = (p: { id?: string }) => null as any;`);
    expect(
      checkWithAdapter({
        componentLocalName: "Foo",
        libPath: lib,
        wrappedComponentInterface: () => ({ acceptsSx: true }),
      }),
    ).toBe(true);
  });

  it("adapter override forcing false wins over an sx-aware file", () => {
    const lib = writeLib(
      "sx",
      `
import * as stylex from "@stylexjs/stylex";
export const Foo = (p: { sx?: stylex.StyleXStyles }) => null as any;
`,
    );
    expect(
      checkWithAdapter({
        componentLocalName: "Foo",
        libPath: lib,
        wrappedComponentInterface: () => ({ acceptsSx: false }),
      }),
    ).toBe(false);
  });

  it("adapter returning undefined falls through to auto-detection (positive)", () => {
    const lib = writeLib(
      "sx2",
      `
import * as stylex from "@stylexjs/stylex";
export const Foo = (p: { sx?: stylex.StyleXStyles }) => null as any;
`,
    );
    expect(
      checkWithAdapter({
        componentLocalName: "Foo",
        libPath: lib,
        wrappedComponentInterface: () => undefined,
      }),
    ).toBe(true);
  });

  it("adapter returning undefined falls through to auto-detection (negative)", () => {
    const lib = writeLib("noSx", `export const Foo = (p: { id?: string }) => null as any;`);
    expect(
      checkWithAdapter({
        componentLocalName: "Foo",
        libPath: lib,
        wrappedComponentInterface: () => undefined,
      }),
    ).toBe(false);
  });

  it("adapter override is consulted for package imports (where auto-detection cannot reach)", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: {
          useSxProp: true,
          wrappedComponentInterface: (ctx) =>
            ctx.importSource === "@company/ui" ? { acceptsSx: true } : undefined,
        },
        importMap: new Map([
          ["Pkg", { importedName: "Pkg", source: { kind: "specifier", value: "@company/ui" } }],
        ]),
        componentLocalName: "Pkg",
        filePath: "/anywhere/consumer.tsx",
      }),
    ).toBe(true);
  });

  it("returns false when useSxProp is disabled even if the file declares sx", () => {
    const lib = writeLib(
      "sx3",
      `
import * as stylex from "@stylexjs/stylex";
export const Foo = (p: { sx?: stylex.StyleXStyles }) => null as any;
`,
    );
    expect(
      checkWithAdapter({
        componentLocalName: "Foo",
        libPath: lib,
        useSxProp: false,
      }),
    ).toBe(false);
  });

  it("returns false when no importMap is provided", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: undefined,
        componentLocalName: "Foo",
        filePath: "/anywhere/consumer.tsx",
      }),
    ).toBe(false);
  });

  it("uses in-memory source overrides before reading from disk", () => {
    const lib = writeLib("noSxOnDisk", `export const Foo = (p: { id?: string }) => null as any;`);
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map([
          [
            "Foo",
            {
              importedName: "Foo",
              source: { kind: "absolutePath", value: lib.replace(/\.(tsx|ts|jsx|js)$/, "") },
            },
          ],
        ]),
        componentLocalName: "Foo",
        filePath: join(dir, "consumer.tsx"),
        sourceOverrides: new Map([
          [
            toRealPath(lib),
            `
import * as stylex from "@stylexjs/stylex";
export function Foo(props: { id?: string } & { sx?: stylex.StyleXStyles }) { return null as any; }
`,
          ],
        ]),
      }),
    ).toBe(true);
  });

  it("returns false when the local name is not in the importMap (local component)", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map(),
        componentLocalName: "LocalThing",
        filePath: "/anywhere/consumer.tsx",
      }),
    ).toBe(false);
  });

  it("detects sx on a same-file local component when source is provided", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map(),
        componentLocalName: "LocalThing",
        filePath: "/anywhere/consumer.tsx",
        localSource: `
import * as stylex from "@stylexjs/stylex";

function LocalThing(props: { sx?: stylex.StyleXStyles; label: string }) {
  return null as any;
}
`,
      }),
    ).toBe(true);
  });

  it("returns false for a same-file local component without sx", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map(),
        componentLocalName: "PlainField",
        filePath: "/anywhere/consumer.tsx",
        localSource: `
type PlainFieldProps = {
  className?: string;
  style?: React.CSSProperties;
  label: string;
};

function PlainField(props: PlainFieldProps) {
  return null as any;
}
`,
      }),
    ).toBe(false);
  });

  it("ignores nested same-file declarations that shadow the wrapped component name", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map(),
        componentLocalName: "PlainField",
        filePath: "/anywhere/consumer.tsx",
        localSource: `
import * as stylex from "@stylexjs/stylex";

function Example() {
  function PlainField(props: { sx?: stylex.StyleXStyles }) {
    return null as any;
  }
  return <PlainField sx={{}} />;
}

function PlainField(props: { className?: string; style?: React.CSSProperties }) {
  return null as any;
}
`,
      }),
    ).toBe(false);
  });
});

describe("isWrappedComponentSxAware — caching", () => {
  it("repeats lookups produce the same result (cache does not lose answers)", () => {
    const lib = writeLib(
      "cache",
      `
import * as stylex from "@stylexjs/stylex";
export function Foo(props: { sx?: stylex.StyleXStyles }) { return null as any; }
`,
    );
    expect(check("Foo", lib)).toBe(true);
    expect(check("Foo", lib)).toBe(true);
    expect(check("Foo", lib)).toBe(true);
  });

  it("cache is keyed per (file, componentName) — different components in the same file are independent", () => {
    const lib = writeLib(
      "cacheMulti",
      `
import * as stylex from "@stylexjs/stylex";
export function WithSx(props: { sx?: stylex.StyleXStyles }) { return null as any; }
export function WithoutSx(props: { id?: string }) { return null as any; }
`,
    );
    expect(check("WithSx", lib)).toBe(true);
    expect(check("WithoutSx", lib)).toBe(false);
    // Re-query in opposite order to make sure neither result poisoned the other.
    expect(check("WithoutSx", lib)).toBe(false);
    expect(check("WithSx", lib)).toBe(true);
  });
});
