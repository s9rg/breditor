import initialize, * as wasm from "@breditor/wasm";
import { bootstrapWasmEngine } from "@breditor/browser/advanced";
import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson,
} from "@breditor/reference-highlight";

/** Force just one generated projection scalar in the diagnostic browser build. */
export async function probeStartupProjectionRejection(control: "nodeCount" | "snapshotRevision") {
  await initialize();
  const prototype = wasm.BreditorProjection.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, control);
  const read = descriptor?.get;
  if (descriptor === undefined || read === undefined) throw new Error(`Projection control getter is absent: ${control}`);
  let reads = 0;
  let original: unknown;
  Object.defineProperty(prototype, control, {
    ...descriptor,
    get() {
      reads += 1;
      original = Reflect.apply(read, this, []);
      return control === "nodeCount" ? 1 : "1";
    },
  });
  try {
    const initial = bootstrapWasmEngine(wasm, {
      kind: "document", lineageId: "startup-projection-control",
      documentJson: createReferenceFormattingDocumentJson("Hello 🙂 world"),
      historyCapacity: 20,
      semanticProfile: { bootstrapJson: REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON, formatVersion: 2 },
    });
    if (initial.ok) {
      initial.observation.free();
      initial.engine.free();
      initial.profileGeneration.free();
      throw new Error(`Startup admitted the altered projection: ${control}`);
    }
    return { error: initial.error.code, reads, original };
  } finally {
    Object.defineProperty(prototype, control, descriptor);
  }
}
