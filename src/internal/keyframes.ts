import { compile } from "stylis";
import { cssPropertyToStylexProp } from "./css-prop-mapping.js";

export function parseKeyframesTemplate(args: {
  template: any;
}): Record<string, Record<string, unknown>> | null {
  const { template } = args;
  if (!template || template.type !== "TemplateLiteral") return null;
  if ((template.expressions?.length ?? 0) > 0) return null;
  const rawCss = (template.quasis ?? []).map((q: any) => q.value?.raw ?? "").join("");
  const wrapped = `@keyframes __SC_KEYFRAMES__ { ${rawCss} }`;
  const ast = compile(wrapped) as any[];

  const frames: Record<string, Record<string, unknown>> = {};
  const visit = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const c of node) visit(c);
      return;
    }
    if (typeof node.type === "string" && node.type === "@keyframes") {
      visit(node.children);
      return;
    }
    if (node.type === "rule") {
      const frameKey = String(node.value ?? "").trim();
      const styleObj: Record<string, unknown> = {};
      const children: any[] = Array.isArray(node.children)
        ? node.children
        : node.children
          ? [node.children]
          : [];

      for (const c of children) {
        if (!c || c.type !== "decl") continue;
        // Stylis keyframes decl nodes use:
        // - `props`: property name (string)
        // - `children`: value (string)
        // (Older stylis formats may also include `value` as `prop:value;`.)
        const propRaw =
          typeof c.props === "string" && c.props
            ? c.props
            : typeof c.value === "string" && c.value.includes(":")
              ? c.value.split(":")[0]!.trim()
              : "";
        const valueRaw =
          typeof c.children === "string"
            ? c.children.trim()
            : typeof c.value === "string" && c.value.includes(":")
              ? c.value.split(":").slice(1).join(":").replace(/;$/, "").trim()
              : "";
        if (!propRaw) continue;
        const raw = propRaw.trim();
        const prop = raw === "background" ? "backgroundColor" : cssPropertyToStylexProp(raw);
        styleObj[prop] = /^-?\d+(\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : valueRaw;
      }

      frames[frameKey] = styleObj;
      return;
    }
    visit(node.children);
  };
  visit(ast);
  return Object.keys(frames).length ? frames : null;
}

export function convertStyledKeyframes(args: {
  root: any;
  j: any;
  styledImports: any;
  keyframesLocal: string;
  objectToAst: (j: any, value: any) => any;
}): { keyframesNames: Set<string>; changed: boolean } {
  const { root, j, styledImports, keyframesLocal, objectToAst } = args;

  const keyframesNames = new Set<string>();
  let changed = false;

  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((p: any) => {
      const init = p.node.init as any;
      if (
        !init ||
        init.type !== "TaggedTemplateExpression" ||
        init.tag?.type !== "Identifier" ||
        init.tag.name !== keyframesLocal
      ) {
        return;
      }
      if (p.node.id.type !== "Identifier") return;
      const localName = p.node.id.name;
      const template = init?.quasi;
      const frames = parseKeyframesTemplate({ template });
      if (!frames) return;

      p.node.init = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
        [objectToAst(j, frames)],
      );
      keyframesNames.add(localName);
      changed = true;
    });

  // Remove `keyframes` import specifier (now handled by stylex).
  styledImports.forEach((imp: any) => {
    const specs = imp.node.specifiers ?? [];
    const next = specs.filter((s: any) => {
      if (s.type !== "ImportSpecifier") return true;
      if (s.imported.type !== "Identifier") return true;
      return s.imported.name !== "keyframes";
    });
    if (next.length !== specs.length) {
      imp.node.specifiers = next;
      if (imp.node.specifiers.length === 0) j(imp).remove();
      changed = true;
    }
  });

  return { keyframesNames, changed };
}
