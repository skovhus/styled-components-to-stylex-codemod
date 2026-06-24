import ts from "typescript";
import {
  isIntrinsicReactHeritageReference,
  isIntrinsicReactPropReference,
  isTransparentUtilityTypeName,
  propertyNameText,
  readUtilityTypeReference,
  resolveAliasedSymbol,
  typeNodeKeyIncludes,
} from "./ts-ast-shared.js";

export function collectExplicitPropNames(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited = new Set<ts.Declaration>(),
): string[] {
  const names = new Set<string>();
  collectExplicitPropNamesInto(names, typeNode, checker, visited);
  return [...names].sort();
}

export function typeNodeHasResolvableSxSurface(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeNode.members.some(
      (member) => ts.isPropertySignature(member) && propertyNameText(member.name) === "sx",
    );
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.some((part) => typeNodeHasResolvableSxSurface(part, checker, visited));
  }

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.every((part) => typeNodeHasResolvableSxSurface(part, checker, visited));
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return false;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    return utilityType.typeArgs.length >= 2 && typeNodeKeyIncludes(utilityType.typeArgs[1], "sx");
  }
  if (utilityType.name === "Omit") {
    const baseType = utilityType.typeArgs[0];
    return (
      baseType !== undefined &&
      utilityType.typeArgs.length >= 2 &&
      !typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      typeNodeHasResolvableSxSurface(baseType, checker, visited)
    );
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    const baseType = utilityType.typeArgs[0];
    return baseType !== undefined && typeNodeHasResolvableSxSurface(baseType, checker, visited);
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  return (symbol?.declarations ?? []).some((declaration) =>
    declarationHasResolvableSxSurface(declaration, checker, visited),
  );
}

export function collectSxExcludedProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): string[] {
  return collectSxSurfaceProperties(typeNode, checker, visited, collectStyleXStylesWithoutKeys)
    .properties;
}

export function collectSxAllowedProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): string[] | undefined {
  const collection = collectSxSurfaceProperties(
    typeNode,
    checker,
    visited,
    collectStyleXStylesKeys,
  );
  return collection.found ? collection.properties : undefined;
}

function collectExplicitPropNamesInto(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member)) {
        const name = propertyNameText(member.name);
        if (name) {
          names.add(name);
        }
      }
    }
    return;
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    for (const part of typeNode.types) {
      collectExplicitPropNamesInto(names, part, checker, visited);
    }
    return;
  }

  if (ts.isUnionTypeNode(typeNode)) {
    let commonNames: Set<string> | undefined;
    for (const part of typeNode.types) {
      const branchNames = new Set<string>();
      collectExplicitPropNamesInto(branchNames, part, checker, new Set(visited));
      if (commonNames === undefined) {
        commonNames = branchNames;
      } else {
        for (const name of commonNames) {
          if (!branchNames.has(name)) {
            commonNames.delete(name);
          }
        }
      }
    }
    for (const name of commonNames ?? []) {
      names.add(name);
    }
    return;
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (utilityType.typeArgs[0]) {
      const pickedNames = new Set<string>();
      collectExplicitPropNamesInto(pickedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of pickedNames) {
        if (typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (utilityType.name === "Omit") {
    if (utilityType.typeArgs[0]) {
      const omittedNames = new Set<string>();
      collectExplicitPropNamesInto(omittedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of omittedNames) {
        if (!typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      collectExplicitPropNamesInto(names, utilityType.typeArgs[0], checker, visited);
    }
    return;
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  for (const declaration of symbol?.declarations ?? []) {
    collectExplicitPropNamesFromDeclaration(names, declaration, checker, visited);
  }
}

function collectSxSurfaceProperties(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): { properties: string[]; found: boolean } {
  const names = new Set<string>();
  const found = collectSxSurfacePropertiesInto(
    names,
    typeNode,
    checker,
    visited,
    collectFromSxType,
  );
  return { properties: [...names].sort(), found };
}

type SxTypePropertyCollector = (
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
) => boolean;

function collectSxSurfacePropertiesInto(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): boolean {
  if (ts.isTypeLiteralNode(typeNode)) {
    let found = false;
    for (const member of typeNode.members) {
      if (
        !ts.isPropertySignature(member) ||
        propertyNameText(member.name) !== "sx" ||
        !member.type
      ) {
        continue;
      }
      found = collectFromSxType(names, member.type, checker, visited) || found;
    }
    return found;
  }

  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    let found = false;
    for (const part of typeNode.types) {
      found =
        collectSxSurfacePropertiesInto(names, part, checker, visited, collectFromSxType) || found;
    }
    return found;
  }

  if (!ts.isTypeReferenceNode(typeNode) || isIntrinsicReactPropReference(typeNode)) {
    return false;
  }

  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (
      utilityType.typeArgs.length >= 2 &&
      typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      utilityType.typeArgs[0]
    ) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }
  if (utilityType.name === "Omit") {
    if (
      utilityType.typeArgs.length >= 2 &&
      !typeNodeKeyIncludes(utilityType.typeArgs[1], "sx") &&
      utilityType.typeArgs[0]
    ) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      return collectSxSurfacePropertiesInto(
        names,
        utilityType.typeArgs[0],
        checker,
        visited,
        collectFromSxType,
      );
    }
    return false;
  }

  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  let found = false;
  for (const declaration of symbol?.declarations ?? []) {
    found =
      collectSxSurfacePropertiesFromDeclaration(
        names,
        declaration,
        checker,
        visited,
        collectFromSxType,
      ) || found;
  }
  return found;
}

function collectSxSurfacePropertiesFromDeclaration(
  names: Set<string>,
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  collectFromSxType: SxTypePropertyCollector,
): boolean {
  if (visited.has(declaration)) {
    return false;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    return collectSxSurfacePropertiesInto(
      names,
      declaration.type,
      checker,
      visited,
      collectFromSxType,
    );
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return false;
  }

  let found = false;
  for (const member of declaration.members) {
    if (ts.isPropertySignature(member) && propertyNameText(member.name) === "sx" && member.type) {
      found = collectFromSxType(names, member.type, checker, visited) || found;
    }
  }

  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        found =
          collectSxSurfacePropertiesFromDeclaration(
            names,
            inheritedDeclaration,
            checker,
            visited,
            collectFromSxType,
          ) || found;
      }
    }
  }
  return found;
}

// `StyleXStyles<T>` requires a type argument to contribute keys, whereas
// `StyleXStylesWithout<T>` always matches (its keys default to all when absent).
type StyleXStylesMatcher = { suffix: string; requireTypeArg: boolean };

const STYLEX_STYLES_WITHOUT_MATCHER: StyleXStylesMatcher = {
  suffix: "StyleXStylesWithout",
  requireTypeArg: false,
};
const STYLEX_STYLES_MATCHER: StyleXStylesMatcher = {
  suffix: "StyleXStyles",
  requireTypeArg: true,
};

function collectStyleXStylesWithoutKeys(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  return collectStyleXStylesKeysMatching(
    names,
    typeNode,
    checker,
    visited,
    STYLEX_STYLES_WITHOUT_MATCHER,
  );
}

function collectStyleXStylesKeys(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  return collectStyleXStylesKeysMatching(names, typeNode, checker, visited, STYLEX_STYLES_MATCHER);
}

function collectStyleXStylesKeysMatching(
  names: Set<string>,
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  matcher: StyleXStylesMatcher,
): boolean {
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText();
    if (
      typeName.endsWith(matcher.suffix) &&
      (!matcher.requireTypeArg || typeNode.typeArguments?.[0])
    ) {
      collectPropertyKeysFromTypeNode(names, typeNode.typeArguments?.[0], checker, visited);
      return true;
    }
    const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
    let found = false;
    for (const declaration of symbol?.declarations ?? []) {
      if (visited.has(declaration)) {
        continue;
      }
      visited.add(declaration);
      if (ts.isTypeAliasDeclaration(declaration)) {
        found =
          collectStyleXStylesKeysMatching(names, declaration.type, checker, visited, matcher) ||
          found;
      } else if (ts.isInterfaceDeclaration(declaration)) {
        found =
          collectStyleXStylesKeysMatchingFromInterface(
            names,
            declaration,
            checker,
            visited,
            matcher,
          ) || found;
      }
    }
    return found;
  }

  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    let found = false;
    for (const part of typeNode.types) {
      found = collectStyleXStylesKeysMatching(names, part, checker, visited, matcher) || found;
    }
    return found;
  }
  return false;
}

function collectStyleXStylesKeysMatchingFromInterface(
  names: Set<string>,
  declaration: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
  matcher: StyleXStylesMatcher,
): boolean {
  let found = false;
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const typeName = heritageType.expression.getText();
      if (
        typeName.endsWith(matcher.suffix) &&
        (!matcher.requireTypeArg || heritageType.typeArguments?.[0])
      ) {
        collectPropertyKeysFromTypeNode(names, heritageType.typeArguments?.[0], checker, visited);
        found = true;
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        if (visited.has(inheritedDeclaration)) {
          continue;
        }
        visited.add(inheritedDeclaration);
        if (ts.isTypeAliasDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesKeysMatching(
              names,
              inheritedDeclaration.type,
              checker,
              visited,
              matcher,
            ) || found;
        } else if (ts.isInterfaceDeclaration(inheritedDeclaration)) {
          found =
            collectStyleXStylesKeysMatchingFromInterface(
              names,
              inheritedDeclaration,
              checker,
              visited,
              matcher,
            ) || found;
        }
      }
    }
  }
  return found;
}

function collectPropertyKeysFromTypeNode(
  names: Set<string>,
  typeNode: ts.TypeNode | undefined,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (!typeNode) {
    return;
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member)) {
        const name = propertyNameText(member.name);
        if (name) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    for (const part of typeNode.types) {
      collectPropertyKeysFromTypeNode(names, part, checker, visited);
    }
    return;
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return;
  }
  const utilityType = readUtilityTypeReference(typeNode);
  if (utilityType.name === "Pick") {
    if (utilityType.typeArgs[0]) {
      const pickedNames = new Set<string>();
      collectPropertyKeysFromTypeNode(pickedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of pickedNames) {
        if (typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (utilityType.name === "Omit") {
    if (utilityType.typeArgs[0]) {
      const omittedNames = new Set<string>();
      collectPropertyKeysFromTypeNode(omittedNames, utilityType.typeArgs[0], checker, visited);
      for (const name of omittedNames) {
        if (!typeNodeKeyIncludes(utilityType.typeArgs[1], name)) {
          names.add(name);
        }
      }
    }
    return;
  }
  if (isTransparentUtilityTypeName(utilityType.name)) {
    if (utilityType.typeArgs[0]) {
      collectPropertyKeysFromTypeNode(names, utilityType.typeArgs[0], checker, visited);
    }
    return;
  }
  const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker);
  for (const declaration of symbol?.declarations ?? []) {
    if (visited.has(declaration)) {
      continue;
    }
    visited.add(declaration);
    if (ts.isTypeAliasDeclaration(declaration)) {
      collectPropertyKeysFromTypeNode(names, declaration.type, checker, visited);
    } else if (ts.isInterfaceDeclaration(declaration)) {
      collectPropertyKeysFromInterfaceDeclaration(names, declaration, checker, visited);
    }
  }
}

function collectPropertyKeysFromInterfaceDeclaration(
  names: Set<string>,
  declaration: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  for (const member of declaration.members) {
    if (ts.isPropertySignature(member)) {
      const name = propertyNameText(member.name);
      if (name) {
        names.add(name);
      }
    }
  }

  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (isIntrinsicReactHeritageReference(heritageType)) {
        continue;
      }
      const symbol = resolveAliasedSymbol(
        checker.getSymbolAtLocation(heritageType.expression),
        checker,
      );
      for (const inheritedDeclaration of symbol?.declarations ?? []) {
        if (visited.has(inheritedDeclaration)) {
          continue;
        }
        visited.add(inheritedDeclaration);
        if (ts.isInterfaceDeclaration(inheritedDeclaration)) {
          collectPropertyKeysFromInterfaceDeclaration(
            names,
            inheritedDeclaration,
            checker,
            visited,
          );
        } else if (ts.isTypeAliasDeclaration(inheritedDeclaration)) {
          collectPropertyKeysFromTypeNode(names, inheritedDeclaration.type, checker, visited);
        }
      }
    }
  }
}

function declarationHasResolvableSxSurface(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  if (visited.has(declaration)) {
    return false;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    return typeNodeHasResolvableSxSurface(declaration.type, checker, visited);
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return false;
  }

  if (
    declaration.members.some(
      (member) => ts.isPropertySignature(member) && propertyNameText(member.name) === "sx",
    )
  ) {
    return true;
  }

  return (declaration.heritageClauses ?? []).some((clause) =>
    clause.types.some(
      (heritageType) =>
        !isIntrinsicReactHeritageReference(heritageType) &&
        declarationHeritageHasResolvableSxSurface(heritageType, checker, visited),
    ),
  );
}

function declarationHeritageHasResolvableSxSurface(
  heritageType: ts.ExpressionWithTypeArguments,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): boolean {
  const symbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(heritageType.expression),
    checker,
  );
  return (symbol?.declarations ?? []).some((declaration) =>
    declarationHasResolvableSxSurface(declaration, checker, visited),
  );
}

function collectExplicitPropNamesFromDeclaration(
  names: Set<string>,
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (visited.has(declaration)) {
    return;
  }
  visited.add(declaration);

  if (ts.isTypeAliasDeclaration(declaration)) {
    collectExplicitPropNamesInto(names, declaration.type, checker, visited);
    return;
  }

  if (!ts.isInterfaceDeclaration(declaration)) {
    return;
  }

  for (const member of declaration.members) {
    if (ts.isPropertySignature(member)) {
      const name = propertyNameText(member.name);
      if (name) {
        names.add(name);
      }
    }
  }
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      collectExplicitPropNamesFromHeritage(names, heritageType, checker, visited);
    }
  }
}

function collectExplicitPropNamesFromHeritage(
  names: Set<string>,
  heritageType: ts.ExpressionWithTypeArguments,
  checker: ts.TypeChecker,
  visited: Set<ts.Declaration>,
): void {
  if (isIntrinsicReactHeritageReference(heritageType)) {
    return;
  }
  const symbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(heritageType.expression),
    checker,
  );
  for (const declaration of symbol?.declarations ?? []) {
    collectExplicitPropNamesFromDeclaration(names, declaration, checker, visited);
  }
}
