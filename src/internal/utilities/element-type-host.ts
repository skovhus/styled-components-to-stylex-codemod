/**
 * Decides whether a component receiving a styled component via an element-type prop
 * (`innerElementType` / `outerElementType`) is *style-only*: it renders the element-type slot
 * without ever forwarding `className` to it.
 *
 * Only style-only hosts may use the narrow element-type wrapper contract (which drops className
 * support). For any other host — one that forwards `className`, spreads unknown props onto the
 * slot, lets the slot escape as a value, or is defined outside this file — we must keep the broad
 * className-merging wrapper, otherwise a host-supplied `className` would be silently overwritten.
 */
import type { Collection, JSCodeshift } from "jscodeshift";

import { getRootJsxIdentifierName } from "./jscodeshift-utils.js";

// jscodeshift AST nodes are awkward to type precisely for this kind of structural probing; a loose
// record shape keeps the traversal readable (see CLAUDE.md on jscodeshift `any` usage).
type AnyNode = { type?: string; [key: string]: unknown };

export function isStyleOnlyElementTypeHost(args: {
  j: JSCodeshift;
  root: Collection;
  hostName: string;
  elementTypePropNames: ReadonlySet<string>;
}): boolean {
  const { j, root, hostName, elementTypePropNames } = args;
  const fnNode = findLocalComponentFunction(j, root, hostName);
  if (!fnNode) {
    return false; // external / unknown host: assume it may forward className
  }

  const slots = collectElementTypeSlotBindings(j, fnNode, elementTypePropNames);
  if (slots.size === 0) {
    return false;
  }

  const fn = j(fnNode as never);
  let renderedSlotCount = 0;
  let forwardsClassName = false;
  fn.find(j.JSXOpeningElement).forEach((path) => {
    const node = path.node as unknown as AnyNode;
    const tag = getRootJsxIdentifierName(node.name);
    if (!tag || !slots.has(tag)) {
      return;
    }
    renderedSlotCount += 1;
    for (const attr of (node.attributes ?? []) as AnyNode[]) {
      if (attr.type === "JSXSpreadAttribute") {
        forwardsClassName = true;
      } else if (
        attr.type === "JSXAttribute" &&
        (attr.name as AnyNode | undefined)?.type === "JSXIdentifier" &&
        (attr.name as { name?: string }).name === "className"
      ) {
        forwardsClassName = true;
      }
    }
  });
  if (forwardsClassName || renderedSlotCount === 0) {
    return false;
  }

  // Any reference to a slot binding other than its declaration or a rendered JSX tag could leak the
  // slot (and thus className) through another component, so treat that as not provably style-only.
  let slotEscapes = false;
  fn.find(j.Identifier).forEach((path) => {
    const name = (path.node as { name?: string }).name;
    if (!name || !slots.has(name)) {
      return;
    }
    const parent = path.parentPath?.node as AnyNode | undefined;
    if (!isSlotBindingOrJsxTagReference(path.node, parent)) {
      slotEscapes = true;
    }
  });
  return !slotEscapes;
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

function findLocalComponentFunction(
  j: JSCodeshift,
  root: Collection,
  hostName: string,
): AnyNode | null {
  let fnNode: AnyNode | null = null;
  root.find(j.FunctionDeclaration).forEach((path) => {
    const node = path.node as unknown as AnyNode;
    if ((node.id as { name?: string } | undefined)?.name === hostName) {
      fnNode ??= node;
    }
  });
  if (fnNode) {
    return fnNode;
  }
  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node as unknown as AnyNode;
    if ((node.id as { name?: string } | undefined)?.name !== hostName) {
      return;
    }
    const init = node.init as AnyNode | undefined;
    if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
      fnNode ??= init;
    }
  });
  return fnNode;
}

function collectElementTypeSlotBindings(
  j: JSCodeshift,
  fnNode: AnyNode,
  elementTypePropNames: ReadonlySet<string>,
): Set<string> {
  const slots = new Set<string>();
  const params = (fnNode.params ?? []) as AnyNode[];
  const first = params[0];

  if (first?.type === "ObjectPattern") {
    for (const prop of (first.properties ?? []) as AnyNode[]) {
      if (prop.type !== "ObjectProperty" && prop.type !== "Property") {
        continue;
      }
      const key = prop.key as { type?: string; name?: string } | undefined;
      if (key?.type !== "Identifier" || !key.name || !elementTypePropNames.has(key.name)) {
        continue;
      }
      const value = prop.value as AnyNode | undefined;
      if (value?.type === "Identifier") {
        slots.add((value as { name?: string }).name ?? "");
      } else if (
        value?.type === "AssignmentPattern" &&
        (value.left as AnyNode | undefined)?.type === "Identifier"
      ) {
        slots.add((value.left as { name?: string }).name ?? "");
      }
    }
  }

  const propsName = first?.type === "Identifier" ? (first as { name?: string }).name : null;
  if (propsName && fnNode.body) {
    j(fnNode.body as never)
      .find(j.VariableDeclarator)
      .forEach((path) => {
        const node = path.node as unknown as AnyNode;
        const id = node.id as { type?: string; name?: string } | undefined;
        if (
          id?.type === "Identifier" &&
          id.name &&
          initReferencesElementTypeProp(node.init, propsName, elementTypePropNames)
        ) {
          slots.add(id.name);
        }
      });
  }

  slots.delete("");
  return slots;
}

function initReferencesElementTypeProp(
  init: unknown,
  propsName: string,
  elementTypePropNames: ReadonlySet<string>,
): boolean {
  const node = init as AnyNode | undefined;
  if (!node) {
    return false;
  }
  if (
    node.type === "MemberExpression" &&
    node.computed !== true &&
    (node.object as { type?: string; name?: string } | undefined)?.type === "Identifier" &&
    (node.object as { name?: string }).name === propsName &&
    (node.property as { type?: string; name?: string } | undefined)?.type === "Identifier" &&
    elementTypePropNames.has((node.property as { name?: string }).name ?? "")
  ) {
    return true;
  }
  if (node.type === "LogicalExpression") {
    return initReferencesElementTypeProp(node.left, propsName, elementTypePropNames);
  }
  return false;
}

function isSlotBindingOrJsxTagReference(idNode: unknown, parent: AnyNode | undefined): boolean {
  if (!parent) {
    return false;
  }
  switch (parent.type) {
    case "JSXOpeningElement":
    case "JSXClosingElement":
      return parent.name === idNode; // rendered as a JSX tag
    case "VariableDeclarator":
      return parent.id === idNode; // const Slot = ...
    case "ObjectProperty":
    case "Property":
      return parent.value === idNode; // { innerElementType: Slot }
    case "AssignmentPattern":
      return parent.left === idNode; // { innerElementType: Slot = default }
    case "MemberExpression":
      return parent.property === idNode; // props.innerElementType property name
    default:
      return false;
  }
}
