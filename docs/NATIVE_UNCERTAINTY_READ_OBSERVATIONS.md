# Read observations through uncertain Native outcomes

An activation or publication that may have started continues to fail with its
original `activation_outcome_unknown` or `publication_outcome_unknown` code.
The host must retain recovery data and confirm against the actual service.
This change never retries, grants readiness or interprets an observation as proof.

The transport and joint coordinators previously replaced their caught error
without retaining its bounded `readFailure` or `payloadReadFailure` fields.
Two injected failures through the actual SDK requesters reproduce that loss:
the expected 408-byte observation becomes `undefined`. These are synthetic
failure-boundary reproductions, not reproductions of a physical short read.

The private `preserve_read_observations.ts` helper copies only these records:

- `readFailure`: literal `read-length`, offset, expected length, length before
  authority checking and actual length.
- `payloadReadFailure`: literal `lineage-payload-read-length`, file length and
  the same four length/offset fields.

All numbers must be nonnegative safe integers held in own data properties.
Each copied record is detached and frozen. Additional fields, payloads, original
errors, messages, stacks, causes, tokens and other object graphs are discarded.
Accessors are ignored. Inaccessible inputs, malformed records or a frozen output
cannot replace the selected mapped error. This is trusted JavaScript diagnostic
handling, not isolation from arbitrary Proxy traps or modified intrinsics.

The two actual requesters and six existing coordinated uncertainty mappings pass
the caught error to their existing private error factory. Ordinary error codes,
messages, request order, uncertain-outcome classification, durable observations,
authentication, native receipts and original protocols remain unchanged. Definite
refusal families do not acquire uncertainty observations. The new data is not
saved to a journal or sent over a protocol.

The component worksets are:

```sh
npm run test:collaboration:native-uncertainty-evidence
npm run test:collaboration:native-uncertainty-evidence:installed
```

Both require the complete 82-case workset and four strict private type contracts.
Eight focused cases cover actual requesters, repeated mapping, redaction,
immutability, accessors, malformed data and diagnostic failure. The remaining
cases exercise the existing activation/publication transports, activation intent
and bounded error-chain reporter. The installed command packs all three SDKs
offline, checks every distribution file, rejects workspace links and changes
only reversible test import locations.

An additional intent test injects one empty read result after approval, before
the request-started journal can be written. The actual bounded reader measures
the refusal; the real coordinator reports the same numeric observation with
`activation_outcome_unknown`, sends zero HTTP requests and performs zero intent
writes. A separate exact reopen verifies the original prepared state and capture.
The same test against the previous SDK fails because the observation is missing.
The injected result establishes the error path, not the cause of the historical
intermittent physical read failure.

Normal Wasm, Rust, defaults, public-root exports and versions are unchanged.
These checks do not replace full process-restart qualification. The older
intermittent archive-read and WebKit faults remain unresolved; numeric evidence
surviving a refusal does not identify or repair their cause.
