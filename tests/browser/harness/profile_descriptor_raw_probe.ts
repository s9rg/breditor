import initialize, * as wasm from "@breditor/wasm";
import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  createReferenceFormattingDocumentJson,
} from "@breditor/reference-highlight";

// Preserve absence and primitive types rather than allowing JSON omission to
// make a function, undefined, and an absent field indistinguishable.
function tagged(values: readonly unknown[]): string {
  return JSON.stringify(values.map(value => [typeof value, value]));
}

// Exact reference-profile declarations, not a baseline from a first getter read.
// These cover required counts, nonzero revisions, property-free zero counts,
// valid string bounds, wrong-domain absence, and out-of-range absence.
const EXPECTED_FIELDS = tagged([
  "example/editor", 1,
  "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc",
  3, 4, 6, 1,
  1, 7, 1, undefined,
  0, 0, 2, undefined,
  1, 2_048, undefined, undefined, undefined, undefined,
]);

function assertDescriptorFields(view: wasm.BreditorCompiledProfileDescriptor, iteration: number, read: number): void {
  const actual = tagged([
    view.schemaName, view.schemaVersion, view.schemaFingerprint, view.formatCount, view.intentCount,
    view.actionStateCount, view.inlineFormatSetCount,
    view.formatRevision(0), view.formatRevision(1), view.formatRevision(2), view.formatRevision(3),
    view.formatPropertyCount(0), view.formatPropertyCount(1), view.formatPropertyCount(2), view.formatPropertyCount(3),
    view.formatPropertyStringMinimumUtf8Bytes(2, 0), view.formatPropertyStringMaximumUtf8Bytes(2, 0),
    view.formatPropertyStringMinimumUtf8Bytes(2, 1), view.formatPropertyStringMaximumUtf8Bytes(2, 1),
    view.formatPropertyStringMinimumUtf8Bytes(2, 2), view.formatPropertyStringMaximumUtf8Bytes(2, 2),
  ]);
  if (actual !== EXPECTED_FIELDS) {
    // Only fixed fixture metadata; no document, checkpoint, or clipboard data.
    throw new Error(`raw descriptor fields differ at ${iteration}/${read}: ${actual}`);
  }
}

/**
 * Isolates real generated descriptor getters from the browser consumer and DOM.
 * Each iteration compiles a fresh profile and reads both profile-owned and
 * engine-owned descriptors. Expected values come from the reference declaration.
 * This complements full startup admission; it does not replace its validation.
 */
export async function probeRawProfileDescriptors(iterations: number): Promise<{ iterations: number; reads: number }> {
  await initialize();
  const document = createReferenceFormattingDocumentJson("raw descriptor probe");
  let reads = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const result = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);
    let profile: wasm.BreditorCompiledProfile | undefined;
    try { profile = result.takeProfile(); } finally { result.free(); }
    if (profile === undefined) throw new Error(`raw profile missing at ${iteration}`);
    try {
      const descriptor = profile.descriptor();
      try { assertDescriptorFields(descriptor, iteration, 0); reads++; } finally { descriptor.free(); }
      const factory = profile.createEngineFromDocumentJsonV3("raw-profile-probe", document, 20);
      let engine: wasm.BreditorEngine | undefined;
      try { engine = factory.takeEngine(); } finally { factory.free(); }
      if (engine === undefined) throw new Error(`raw engine missing at ${iteration}`);
      try {
        for (let read = 1; read < 3; read++) {
          const descriptor = engine.profileDescriptor();
          try { assertDescriptorFields(descriptor, iteration, read); reads++; } finally { descriptor.free(); }
        }
      } finally { engine.free(); }
    } finally { profile.free(); }
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { iterations, reads };
}
