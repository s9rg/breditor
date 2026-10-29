# Native-held version delivery

Status: [source and independently installed qualification passed](qualification/2026-10-29-native-version-delivery.json): 593 direct checks, 98 installed checks, seven strict source type stages and two installed type stages. All thirteen V1 gates remain open.

The private version delivery factory borrows an already-open, disconnected
catalog and its exact constructor-owned source and native recovery context.
It publishes the original retained immutable packets through the existing
version protocol. It does not create a replacement catalog or recapture a
version. Public root exports, wire formats, defaults and historical identities
remain unchanged.

Each operation checks fresh host authority and uses explicit per-call work
admission. Ordinary catalog mutations and editor commands remain excluded.
The real original source is saved before a separately stored metadata receipt;
retained generation sources keep their existing atomic record driver. Public
source method overrides do not supply persistence authority.

A server receipt and a local durable receipt are distinct facts. A failed local
write retains the exact accepted winner, original packet and pending record for
explicit retry. A committed local write is recorded as durable before checking
post-commit authority. A lost reply leaves publication uncertain; a new genuine
context reads the original server result without duplicating publication.
Closing waits for actual writes and outstanding transport work, including local
retry. Closing neither retries failed writes nor releases native recovery.

Functional tests use real Rust servers and the unchanged normal Wasm runtime.
They cover original, retained segmented, and all four independent document /
comment history combinations; original and atomic writer transports; explicit
and natural typing histories; original, general and document selection where
supported. Separate complete-room coverage publishes the original retained
catalog during prepared recovery, then cold-reopens all seven source families
and verifies future native document and comment Undo/Redo. The installed checker
runs the complete same test files from fresh archives with locked dependencies
and no workspace links.

This is one part of full room recovery. The [compound metadata preparation path](HELD_METADATA_PREPARATION.md) now opens
existing atomic children without saving, networking or granting ordinary mutations.
The [suggestion delivery path](NATIVE_SUGGESTION_DELIVERY.md) now executes
original queued decisions through held author/observer transports. Revision
delivery, all-family metadata settlement, fresh provider/client/assets
reconciliation and authenticated joint activation remain
required. No full V1 gate is closed by this contract.
