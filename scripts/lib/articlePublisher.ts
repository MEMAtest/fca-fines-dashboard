import ts from "typescript";

function getStringProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
  sourceFile: ts.SourceFile,
) {
  const property = object.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate) &&
    candidate.name.getText(sourceFile).replace(/["']/g, "") === name,
  );
  if (!property || !ts.isPropertyAssignment(property)) return undefined;
  return ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined;
}

/** Insert an approved article, or replace only a legacy unreviewed AI entry. */
export function upsertApprovedArticleSource(source: string, slug: string, entry: string) {
  const sourceFile = ts.createSourceFile("blogArticles.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let baseArray: ts.ArrayLiteralExpression | undefined;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.name.getText(sourceFile) === "baseBlogArticles" &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        baseArray = declaration.initializer;
      }
    }
  }
  if (!baseArray) throw new Error("Could not find baseBlogArticles array");

  const existing = baseArray.elements.find((element) =>
    ts.isObjectLiteralExpression(element) && getStringProperty(element, "slug", sourceFile) === slug,
  );
  if (existing && ts.isObjectLiteralExpression(existing)) {
    const legacyAi =
      getStringProperty(existing, "generatedBy", sourceFile) === "ai" &&
      !existing.properties.some((property) => property.name?.getText(sourceFile) === "editorialManifest");
    if (!legacyAi) {
      throw new Error(`Article slug already exists and is not a replaceable legacy AI entry: ${slug}`);
    }
    return source.slice(0, existing.getStart(sourceFile)) + entry.trimStart() + source.slice(existing.getEnd());
  }

  const markerIdx = source.indexOf("const baseBlogArticles: BlogArticleMeta[] = [");
  if (markerIdx === -1) throw new Error("Could not find baseBlogArticles marker");
  const afterMarker = source.slice(markerIdx);
  const closeMatch = afterMarker.match(/\n\];\n/);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new Error("Could not find end of baseBlogArticles array");
  }

  const insertPos = markerIdx + closeMatch.index;
  const before = source.slice(0, insertPos);
  const after = source.slice(insertPos);
  const trimmedBefore = before.trimEnd().replace(/,\s*$/, "");
  return `${trimmedBefore},\n${entry}${after}`;
}
