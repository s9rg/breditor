import {
  isOwnedInlineFormatRenderManifest,
  type InlineFormatRenderManifest,
  type InlineFormatRenderRecipe,
} from "./inline_format_render_manifest.js";
import {
  browserCompiledProfileDescriptorMatchesGeneration,
  isOwnedBrowserCompiledProfileDescriptor,
  wasmProfileGenerationIsLive,
  type BrowserCompiledProfileDescriptor,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

declare const BROWSER_PRESENTATION_IDENTITY_BRAND: unique symbol;

/**
 * Opaque, process-local identity for one checked browser presentation.
 *
 * It is deliberately non-scalar and must never enter a schema fingerprint,
 * document, checkpoint, history entry, or other durable representation.
 */
export interface BrowserPresentationIdentity {
  readonly [BROWSER_PRESENTATION_IDENTITY_BRAND]: "BrowserPresentationIdentity";
}

/** Exact immutable presentation bound to one compiled semantic profile. */
export interface BrowserCompiledPresentation {
  readonly identity: BrowserPresentationIdentity;
  readonly profileDescriptor: BrowserCompiledProfileDescriptor;
  readonly manifest: InlineFormatRenderManifest;
  /** Canonical ancestor/outer to descendant/inner wrapper order. */
  readonly recipesOuterToInner: readonly InlineFormatRenderRecipe[];
}

interface PresentationMetadata {
  readonly identity: BrowserPresentationIdentity;
  readonly profileDescriptor: BrowserCompiledProfileDescriptor;
  readonly profileGeneration: WasmProfileGenerationView;
  readonly recipesByKind: ReadonlyMap<string, InlineFormatRenderRecipe>;
}

const OWNED_PRESENTATIONS = new WeakSet<object>();
const OWNED_IDENTITIES = new WeakSet<object>();
const PRESENTATION_METADATA = new WeakMap<object, PresentationMetadata>();

/**
 * Checks exact recipe coverage and compiles deterministic DOM nesting.
 *
 * Construction is all-or-nothing. Every semantic format must have one recipe,
 * every ordering target must be present, DOM signatures must be unique, and
 * the bounded `before`/`after` graph must be acyclic. Registration order is
 * never observed: zero-indegree ties use lexical format identity.
 */
export function compileBrowserPresentation(
  profileGeneration: WasmProfileGenerationView,
  profileDescriptor: BrowserCompiledProfileDescriptor,
  manifest: InlineFormatRenderManifest,
): BrowserCompiledPresentation {
  if (!wasmProfileGenerationIsLive(profileGeneration)) {
    throw new TypeError("browser presentation profile generation is invalid");
  }
  if (!isOwnedBrowserCompiledProfileDescriptor(profileDescriptor)) {
    throw new TypeError("browser presentation profile descriptor is not owned");
  }
  if (
    !browserCompiledProfileDescriptorMatchesGeneration(
      profileDescriptor,
      profileGeneration,
    )
  ) {
    throw new TypeError(
      "browser presentation profile descriptor does not match the generation",
    );
  }
  if (!isOwnedInlineFormatRenderManifest(manifest)) {
    throw new TypeError("browser presentation render manifest is not owned");
  }

  const formats = profileDescriptor.formats;
  const recipes = manifest.recipes;
  if (recipes.length !== formats.length) {
    throw new TypeError("browser presentation recipe coverage is incomplete");
  }

  const recipesByKind = new Map<string, InlineFormatRenderRecipe>();
  for (const recipe of recipes) recipesByKind.set(recipe.formatKind, recipe);
  for (const format of formats) {
    if (!recipesByKind.has(format.kind)) {
      throw new TypeError("browser presentation recipe coverage is incomplete");
    }
  }

  requireUniqueDomSignatures(recipes);
  const recipesOuterToInner = compileOuterToInnerOrder(recipes, recipesByKind);
  const identity = Object.freeze(
    Object.create(null) as BrowserPresentationIdentity,
  );
  const presentation: BrowserCompiledPresentation = Object.freeze({
    identity,
    profileDescriptor,
    manifest,
    recipesOuterToInner,
  });
  const metadata: PresentationMetadata = Object.freeze({
    identity,
    profileDescriptor,
    profileGeneration,
    recipesByKind,
  });
  OWNED_IDENTITIES.add(identity);
  OWNED_PRESENTATIONS.add(presentation);
  PRESENTATION_METADATA.set(presentation, metadata);
  return presentation;
}

/** Whether a value was minted by the checked presentation compiler. */
export function isOwnedBrowserCompiledPresentation(
  value: unknown,
): value is BrowserCompiledPresentation {
  try {
    return typeof value === "object" &&
      value !== null &&
      OWNED_PRESENTATIONS.has(value) &&
      PRESENTATION_METADATA.has(value);
  } catch {
    return false;
  }
}

/** Whether a value is a process-local identity minted by this compiler. */
export function isOwnedBrowserPresentationIdentity(
  value: unknown,
): value is BrowserPresentationIdentity {
  try {
    return typeof value === "object" && value !== null && OWNED_IDENTITIES.has(value);
  } catch {
    return false;
  }
}

/**
 * Checks the exact immutable descriptor and opaque generation bound at compile.
 * Generated generation clones are accepted only when matching is symmetric.
 * @internal
 */
export function browserPresentationMatchesProfile(
  presentation: unknown,
  profileGeneration: WasmProfileGenerationView,
  profileDescriptor: BrowserCompiledProfileDescriptor,
): presentation is BrowserCompiledPresentation {
  if (!isOwnedBrowserCompiledPresentation(presentation)) return false;
  const metadata = PRESENTATION_METADATA.get(presentation);
  return metadata !== undefined &&
    metadata.profileDescriptor === profileDescriptor &&
    browserCompiledProfileDescriptorMatchesGeneration(
      profileDescriptor,
      metadata.profileGeneration,
    ) &&
    browserCompiledProfileDescriptorMatchesGeneration(
      profileDescriptor,
      profileGeneration,
    );
}

/** Returns the checked recipe for one admitted semantic format. @internal */
export function browserPresentationRecipeForFormat(
  presentation: BrowserCompiledPresentation,
  formatKind: string,
): InlineFormatRenderRecipe | undefined {
  if (!isOwnedBrowserCompiledPresentation(presentation)) return undefined;
  return PRESENTATION_METADATA.get(presentation)?.recipesByKind.get(formatKind);
}

/** Checks identity ownership without treating a caller-forged object as proof. @internal */
export function browserPresentationOwnsIdentity(
  presentation: unknown,
  identity: unknown,
): identity is BrowserPresentationIdentity {
  if (!isOwnedBrowserCompiledPresentation(presentation)) return false;
  const metadata = PRESENTATION_METADATA.get(presentation);
  return metadata?.identity === identity &&
    isOwnedBrowserPresentationIdentity(identity);
}

function requireUniqueDomSignatures(
  recipes: readonly InlineFormatRenderRecipe[],
): void {
  const signatures = new Set<string>();
  for (const recipe of recipes) {
    const signature = `${recipe.element}\u0000${recipe.classes.join(" ")}`;
    if (signatures.has(signature)) {
      throw new TypeError("browser presentation DOM signature is duplicated");
    }
    signatures.add(signature);
  }
}

function compileOuterToInnerOrder(
  recipes: readonly InlineFormatRenderRecipe[],
  recipesByKind: ReadonlyMap<string, InlineFormatRenderRecipe>,
): readonly InlineFormatRenderRecipe[] {
  const kinds = recipes.map((recipe) => recipe.formatKind);
  const outgoing = new Map<string, Set<string>>(
    kinds.map((kind) => [kind, new Set<string>()]),
  );
  const indegree = new Map<string, number>(kinds.map((kind) => [kind, 0]));
  const relationships = new Set<string>();

  const addRelationship = (outer: string, inner: string): void => {
    if (!recipesByKind.has(outer) || !recipesByKind.has(inner)) {
      throw new TypeError("browser presentation order target is absent");
    }
    const key = `${outer}\u0000${inner}`;
    if (relationships.has(key)) {
      throw new TypeError("browser presentation order relationship is duplicated");
    }
    relationships.add(key);
    outgoing.get(outer)?.add(inner);
    indegree.set(inner, (indegree.get(inner) ?? 0) + 1);
  };

  for (const recipe of recipes) {
    for (const inner of recipe.before) {
      addRelationship(recipe.formatKind, inner);
    }
    for (const outer of recipe.after) {
      addRelationship(outer, recipe.formatKind);
    }
  }

  const emitted = new Set<string>();
  const ordered: InlineFormatRenderRecipe[] = [];
  while (ordered.length < kinds.length) {
    const next = kinds.find(
      (kind) => !emitted.has(kind) && indegree.get(kind) === 0,
    );
    if (next === undefined) {
      throw new TypeError("browser presentation render order contains a cycle");
    }
    emitted.add(next);
    const recipe = recipesByKind.get(next);
    if (recipe === undefined) {
      throw new TypeError("browser presentation recipe coverage is incomplete");
    }
    ordered.push(recipe);
    for (const inner of outgoing.get(next) ?? []) {
      indegree.set(inner, (indegree.get(inner) ?? 0) - 1);
    }
  }
  return Object.freeze(ordered);
}
