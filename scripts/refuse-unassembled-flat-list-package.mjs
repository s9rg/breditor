// The workspace is a package template, not a built deliverable. Assembly strips
// this repository-only guard after admitting a qualified browser/Wasm pair.
throw new Error("Use npm run build:lists:opt-in -- <private-package-qualification.json>; the unassembled workspace must not be packed.");
