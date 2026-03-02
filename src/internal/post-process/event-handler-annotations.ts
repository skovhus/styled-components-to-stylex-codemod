/**
 * Post-processing pass to annotate event handler parameters at usage sites.
 * After styled-component conversion, inline arrow function event handlers
 * on converted components may lose type inference (implicit-any).
 * This pass adds explicit React event type annotations.
 */
import type { JSCodeshift } from "jscodeshift";

/** Maps event handler prop names to their React event type. */
const EVENT_TYPE_MAP: Record<string, string> = {
  onClick: "React.MouseEvent",
  onContextMenu: "React.MouseEvent",
  onMouseDown: "React.MouseEvent",
  onMouseUp: "React.MouseEvent",
  onMouseEnter: "React.MouseEvent",
  onMouseLeave: "React.MouseEvent",
  onMouseMove: "React.MouseEvent",
  onMouseOver: "React.MouseEvent",
  onDoubleClick: "React.MouseEvent",
  onKeyDown: "React.KeyboardEvent",
  onKeyUp: "React.KeyboardEvent",
  onKeyPress: "React.KeyboardEvent",
  onChange: "React.ChangeEvent",
  onInput: "React.FormEvent",
  onFocus: "React.FocusEvent",
  onBlur: "React.FocusEvent",
  onSubmit: "React.FormEvent",
  onScroll: "React.UIEvent",
  onWheel: "React.WheelEvent",
  onDragStart: "React.DragEvent",
  onDragEnd: "React.DragEvent",
  onDrop: "React.DragEvent",
  onDragOver: "React.DragEvent",
  onTouchStart: "React.TouchEvent",
  onTouchEnd: "React.TouchEvent",
  onTouchMove: "React.TouchEvent",
  onPointerDown: "React.PointerEvent",
  onPointerUp: "React.PointerEvent",
  onPointerMove: "React.PointerEvent",
  onCopy: "React.ClipboardEvent",
  onCut: "React.ClipboardEvent",
  onPaste: "React.ClipboardEvent",
  onAnimationEnd: "React.AnimationEvent",
  onAnimationStart: "React.AnimationEvent",
  onTransitionEnd: "React.TransitionEvent",
};

/** Maps intrinsic JSX tag names to their DOM element interface names. */
const INTRINSIC_TAG_TO_ELEMENT_TYPE: Record<string, string> = {
  a: "HTMLAnchorElement",
  button: "HTMLButtonElement",
  div: "HTMLDivElement",
  form: "HTMLFormElement",
  img: "HTMLImageElement",
  input: "HTMLInputElement",
  label: "HTMLLabelElement",
  li: "HTMLLIElement",
  ol: "HTMLOListElement",
  option: "HTMLOptionElement",
  select: "HTMLSelectElement",
  span: "HTMLSpanElement",
  svg: "SVGSVGElement",
  table: "HTMLTableElement",
  tbody: "HTMLTableSectionElement",
  td: "HTMLTableCellElement",
  textarea: "HTMLTextAreaElement",
  th: "HTMLTableCellElement",
  thead: "HTMLTableSectionElement",
  tr: "HTMLTableRowElement",
  ul: "HTMLUListElement",
};

/**
 * Annotates event handler arrow function parameters at JSX usage sites of converted components.
 *
 * `componentTagMap` is best-effort and only populated for intrinsic-base conversions.
 * For wrappers around non-intrinsic components, event annotations stay non-generic.
 *
 * @returns true if any annotations were added
 */
export function annotateEventHandlerParams(args: {
  root: ReturnType<JSCodeshift>;
  j: JSCodeshift;
  convertedNames: Set<string>;
  componentTagMap: Map<string, string>;
}): boolean {
  const { root, j, convertedNames, componentTagMap } = args;
  if (convertedNames.size === 0) {
    return false;
  }

  let changed = false;

  // Find all JSX elements using converted component names
  root
    .find(j.JSXOpeningElement)
    .filter((path) => {
      const name = path.node.name;
      if (name.type === "JSXIdentifier") {
        return convertedNames.has(name.name);
      }
      return false;
    })
    .forEach((jsxPath) => {
      const openingName = jsxPath.node.name;
      const componentName = openingName.type === "JSXIdentifier" ? openingName.name : null;
      const intrinsicTag = componentName ? componentTagMap.get(componentName) : undefined;
      const elementType = intrinsicTag ? INTRINSIC_TAG_TO_ELEMENT_TYPE[intrinsicTag] : undefined;

      for (const attr of jsxPath.node.attributes ?? []) {
        if (attr.type !== "JSXAttribute" || !attr.name || attr.name.type !== "JSXIdentifier") {
          continue;
        }
        const propName = attr.name.name;
        const eventType = EVENT_TYPE_MAP[propName];
        if (!eventType) {
          continue;
        }

        // Check if the value is an inline arrow function expression
        const value = attr.value;
        if (!value || value.type !== "JSXExpressionContainer") {
          continue;
        }
        const expr = value.expression;
        if (!expr || expr.type !== "ArrowFunctionExpression") {
          continue;
        }

        // Check if the first parameter needs annotation
        const firstParam = expr.params[0];
        if (!firstParam) {
          continue;
        }
        // Skip if already annotated
        if ((firstParam as { typeAnnotation?: unknown }).typeAnnotation) {
          continue;
        }
        // Only annotate simple identifier params (not destructured)
        if (firstParam.type !== "Identifier") {
          continue;
        }

        // Build the React event type annotation
        const parts = eventType.split(".");
        const typeRef = j.tsTypeReference(
          j.tsQualifiedName(j.identifier(parts[0]!), j.identifier(parts[1]!)),
        );
        if (elementType) {
          (typeRef as { typeParameters?: unknown }).typeParameters = j.tsTypeParameterInstantiation(
            [j.tsTypeReference(j.identifier(elementType))],
          );
        }

        // Build a new annotated parameter and replace the entire arrow function
        // so recast reprints it with parentheses around the typed parameter.
        const annotatedParam = j.identifier(firstParam.name);
        annotatedParam.typeAnnotation = j.tsTypeAnnotation(typeRef);
        const newArrow = j.arrowFunctionExpression(
          [annotatedParam, ...expr.params.slice(1)],
          expr.body,
          expr.expression,
        );
        newArrow.async = expr.async ?? false;
        newArrow.returnType = expr.returnType ?? null;
        value.expression = newArrow;
        changed = true;
      }
    });

  return changed;
}
