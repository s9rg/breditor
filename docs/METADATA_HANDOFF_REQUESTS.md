# Metadata handoff requests

Joint recovery needs separate requests for metadata inspection, metadata approval
and final publication approval. Passing the combined input into the closed
metadata parser refused valid work with `record_cut_policy`.

The private `metadataContinuationPreviewRequest` and
`metadataContinuationRunRequest` helpers now project those requests explicitly.
They reject unrelated fields and accessors. A preview carries no approval; a run
carries its expected choice and metadata approval. The publication callback stays
with the joint owner. These helpers neither invoke callbacks nor admit Native
ownership. The existing receiving parser body is unchanged, and the coordinator
still validates the genuine target witness before parsing application input.

The unchanged five-case reproducer initially failed three cases. It now passes,
alongside seven new request-policy cases and six existing contracts. The actual
seven-family replacement test and its nine nested storage cases also pass from
source and independently installed packages: **28 cases per environment**.
That test supplies the projected requests during preview, refusal, interrupted
write and resume, and uses a final publication callback that throws if invoked.
Original pending packets, review/version/revision receipts, journal reopen and
future document/comment Undo/Redo are preserved.

The main integration matches the entire tested source tree before documentation;
all **2,835 distribution files** match the installed packages. Strict private
TypeScript checks and the 18 focused contracts also pass on main. Rust, normal
Wasm, original wire formats, package versions and public-root exports are unchanged.

See the [qualification](qualification/2026-11-03-metadata-handoff-requests.json)
and its bounded, read-back-verified source/package/runtime proof. The complete
Warm and Cold joint workflows remain separate qualifications. This component
does not resolve the historical archive-read or WebKit fault or pass a V1 gate.
