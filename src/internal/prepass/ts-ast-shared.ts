import ts from "typescript";

export function resolveAliasedSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (!symbol || (symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return symbol;
  }
  return checker.getAliasedSymbol(symbol);
}

export function readUtilityTypeReference(typeNode: ts.TypeReferenceNode): {
  name: string;
  typeArgs: readonly ts.TypeNode[];
} {
  return {
    name: typeNode.typeName.getText(),
    typeArgs: typeNode.typeArguments ?? [],
  };
}

export function isTransparentUtilityTypeName(typeName: string): boolean {
  return typeName === "Partial" || typeName === "Required" || typeName === "Readonly";
}

export function typeNodeKeyIncludes(typeNode: ts.TypeNode | undefined, key: string): boolean {
  if (!typeNode) {
    return false;
  }
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return typeNode.literal.text === key;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((part) => typeNodeKeyIncludes(part, key));
  }
  return false;
}

export function isIntrinsicReactPropReference(typeNode: ts.TypeReferenceNode): boolean {
  const typeName = typeNode.typeName.getText();
  return /^(?:React\.)?(?:ComponentProps|ComponentPropsWithRef|ComponentPropsWithoutRef|HTMLAttributes|ButtonHTMLAttributes|AnchorHTMLAttributes|InputHTMLAttributes|SVGProps)$/.test(
    typeName,
  );
}

export function isIntrinsicReactHeritageReference(
  heritageType: ts.ExpressionWithTypeArguments,
): boolean {
  const typeName = heritageType.expression.getText();
  return /^(?:React\.)?(?:ComponentProps|ComponentPropsWithRef|ComponentPropsWithoutRef|HTMLAttributes|ButtonHTMLAttributes|AnchorHTMLAttributes|InputHTMLAttributes|SVGProps)$/.test(
    typeName,
  );
}

export function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

export function bindingPatternHasName(pattern: ts.ObjectBindingPattern, name: string): boolean {
  return pattern.elements.some((element) => element.name.getText() === name);
}

export function bindingElementPropertyNameText(element: ts.BindingElement): string | null {
  if (element.propertyName) {
    return ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)
      ? element.propertyName.text
      : null;
  }
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

export function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function isIdentifierNamed(expression: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expression) && expression.text === name;
}
