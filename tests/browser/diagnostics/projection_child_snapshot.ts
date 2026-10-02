const codes = new Set([
  "projection.invalid_shape", "projection.invalid_snapshot", "projection.resource_limit",
  "projection.noncanonical_runs", "projection.invalid_update", "renderer.invalid_host",
  "renderer.foreign_or_stale_render", "renderer.dom_write_failed",
]);

function own(value: unknown, key: string): PropertyDescriptor | undefined {
  return typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, key) : undefined;
}

/** Later observations of a rejected result, never the original predicate value.
 * Reads only own data descriptors; does not touch the projection or a Wasm view.
 */
export function snapshotProjectionChild(result: unknown) {
  try {
    const ok = own(result, "ok");
    const error = own(result, "error");
    const code = error && "value" in error ? own(error.value, "code") : undefined;
    const value = own(result, "value");
    const rawOk: unknown = ok && "value" in ok ? ok.value : undefined;
    const rawCode: unknown = code && "value" in code ? code.value : undefined;
    return {
      resultType: typeof result,
      frozen: typeof result === "object" && result !== null && Object.isFrozen(result),
      okField: ok === undefined ? "absent" : "value" in ok ? "data" : "accessor",
      okType: typeof rawOk,
      ok: rawOk === true ? "true" : rawOk === false ? "false" : "unknown",
      okJson: typeof rawOk === "boolean" ? JSON.stringify(rawOk) : "<not-boolean>",
      valueField: value === undefined ? "absent" : "value" in value ? "data" : "accessor",
      errorField: error === undefined ? "absent" : "value" in error ? "data" : "accessor",
      code: typeof rawCode === "string" && codes.has(rawCode) ? rawCode : "unknown",
    };
  } catch { return { unreadable: true }; }
}
