# Local metadata asset references

This private dependency-DATA contract reads one exact retained metadata point.
It is the reference-discovery prerequisite for complete metadata asset recovery.
It supplies no provider/upload capability, retention approval or activation.

The input is a complete closed local metadata state and an explicit selected lane.
The collector detaches that state before callbacks and validates its unchanged
original bindings, packet records, native history identities and source cuts.
The actual native owner must match both recorded document and comment journals
and their original/segmented policies. Original proposal, revision, version and
owned-history admission is reused, including retained final effects.

The returned state revision, canonical UTF-8 length and SHA-256 pin the exact data
whose dependencies were read. Every reference read comes from the actual native
owner and its own unchanged publication. A native stamp covers document AND
comment changes, so comment-only mutation during callbacks or digesting refuses.
No native edit, journal write, SDK queue change or network work is performed.

Discovery includes retained native Undo/Redo, all original source-version packets,
all cached metadata versions, every original proposal and each revision with its
original predecessor packet. Revisions include intermediate image generations
and images removed from the final proposed tree. Atomic asset/generation pairs
are retained exactly and deduplicated. Existing source/store bounds remain in
force; the original 1,024-packet and 100,000-reference read bounds are explicit.
The currently admitted 32 source versions, 32 cached versions, 256 proposals and
256 revisions fit within that packet limit without truncation.

Missing native source clocks and uncached catalog entries return explicit Pending.
Pending contains no partial Ready reference set. A version packet present only
in the source journal does not pretend to be cached in the metadata catalog.
After the actual source update or original cache download, a NEW exact point can
be read. The previous state digest never silently changes meaning.

The native functional tests cover all four independent document/comment history
layouts with both owned and unowned policies, hidden/proposal-only images, exact
journals, pending-to-ready transitions, comment-only invalidation and input
detachment. Independent npm archives execute the same tests and strict API types.

Still required: integrate these reads under the genuine complete metadata owner,
couple original/current/stored/historical points to one reference decision,
reconcile actual provider and client bytes with authenticated current server
requirements, preserve uploads and then perform authenticated whole-room
activation. A dependency set is not asset availability. Original formats,
defaults, public exports, package versions and normal Rust/Wasm are unchanged.
All thirteen V1/parity gates remain open.
