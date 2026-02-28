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

/**
 * Annotates event handler arrow function parameters at JSX usage sites of converted components.
 *
 * @returns true if any annotations were added
 */
export function annotateEventHandlerParams(args: {
  root: ReturnType<JSCodeshift>;
  j: JSCodeshift;
  convertedNames: Set<string>;
}): boolean {
  const { root, j, convertedNames } = args;
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

        // Parse the React event type into an AST annotation
        const parts = eventType.split(".");
        const typeRef = j.tsTypeReference(
          j.tsQualifiedName(j.identifier(parts[0]!), j.identifier(parts[1]!)),
        );
        (firstParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(typeRef);
        changed = true;
      }
    });

  return changed;
}
