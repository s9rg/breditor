/** Root-relative indexes into one immutable Breditor AST snapshot. */
export type AstPath = readonly number[];

/** Returns whether two root-relative paths contain the same indexes. */
export function astPathsEqual(left: AstPath, right: AstPath): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let offset = 0; offset < left.length; offset += 1) {
    if (left[offset] !== right[offset]) {
      return false;
    }
  }
  return true;
}

/** @internal */
export function rootAstPath(): AstPath {
  return Object.freeze([]);
}

/** @internal */
export function paragraphAstPath(paragraphIndex: number): AstPath {
  return Object.freeze([paragraphIndex]);
}

/** @internal */
export function textRunAstPath(paragraphIndex: number, runIndex: number): AstPath {
  return Object.freeze([paragraphIndex, runIndex]);
}

/** @internal */
export function astPathKey(path: AstPath): string | null {
  if (!Array.isArray(path) || path.length > 2) {
    return null;
  }
  let key = "root";
  for (let offset = 0; offset < path.length; offset += 1) {
    const index = path[offset];
    if (index === undefined) {
      return null;
    }
    if (!Number.isSafeInteger(index) || index < 0) {
      return null;
    }
    key += `/${index}`;
  }
  return key;
}
