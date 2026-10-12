/** Private capability forwarding for nested startup/restore projection facades.
 * Keep generated receivers and raw word returns intact. This is not a public
 * transport selection API, and default/base/flat bootstraps must not probe it.
 */
export function snapshotNestedProjectionWordFacade(
  raw: object,
  isThenable: (value: unknown) => boolean,
): Readonly<Record<string, unknown>> | null {
  const names = ["childCountWords", "childAtWords", "formatCountWords",
    "formatPropertyCountWords", "headingLevelWords", "orderedListStartWords"] as const;
  const scalarVersion: unknown = Reflect.get(raw, "projectionScalarWordsVersion", raw);
  const scalarAsync = isThenable(scalarVersion);
  const integerVersion: unknown = Reflect.get(raw, "projectionIntegerWordsVersion", raw);
  const integerAsync = isThenable(integerVersion);
  if (scalarAsync || integerAsync) return null;
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (scalarVersion === undefined) {
    if (integerVersion !== undefined) return null;
    // Missing markers are legacy only when the capability is wholly absent.
    for (const name of [...names, "formatPropertyIntegerWords"]) {
      const value: unknown = Reflect.get(raw, name, raw);
      if (isThenable(value) || value !== undefined) return null;
    }
    return Object.freeze(fields);
  }
  if (scalarVersion !== 1 || (integerVersion !== undefined && integerVersion !== 1)) return null;
  fields["projectionScalarWordsVersion"] = scalarVersion;
  for (const name of names) {
    const method: unknown = Reflect.get(raw, name, raw);
    if (isThenable(method) || typeof method !== "function") return null;
    fields[name] = (...args: number[]): unknown => Reflect.apply(method, raw, args) as unknown;
  }
  const integerMethod: unknown = Reflect.get(raw, "formatPropertyIntegerWords", raw);
  if (isThenable(integerMethod)) return null;
  if (integerVersion === undefined) {
    if (integerMethod !== undefined) return null;
  } else {
    if (typeof integerMethod !== "function") return null;
    fields["projectionIntegerWordsVersion"] = integerVersion;
    fields["formatPropertyIntegerWords"] = (...args: number[]): unknown =>
      Reflect.apply(integerMethod, raw, args) as unknown;
  }
  return Object.freeze(fields);
}
