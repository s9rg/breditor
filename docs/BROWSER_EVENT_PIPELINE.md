# Breditor browser event pipeline

Status: implemented for the closed base schema in `0.0.53`; pre-`0.1` API

This is Breditor's own browser-to-core command contract. ProseMirror, Lexical,
Tiptap, and CKEditor remain research references; their event, transaction,
selection, plugin, and DOM-reconciliation protocols are not adopted.

The Rust AST remains authoritative. Outside an explicitly leased composition
session, an owned browser mutation is either canceled before the DOM changes or
reported as requiring canonical reconciliation. Native `input` is a
postcondition signal and never causes a second semantic command.

## Delivery sequence

One executable browser command is derived and delivered synchronously as:

```text
native event
  -> bounded scalar snapshot + exact semantic selection
  -> immutable command request + one-use delivery token
  -> bounded non-recursive FIFO
  -> guarded Rust selection synchronization
  -> optional history-group close
  -> exactly one action, undo, or redo
  -> consume exact semantic successor projection
  -> update canonical DOM + restore semantic selection
  -> handle-free notification
```

The request contains no `Event`, DOM node, `Range`, `StaticRange`,
`DataTransfer`, generated Wasm handle, callback, or promise. Its selection and
delivery token refer to the same exact `BaseDocumentProjection` object. The
adapter additionally binds the token to a private authority, the current
renderer handle, its generation, the exact engine snapshot, and a monotonically
spent observation epoch.

`EditorDeliveryToken` is an opaque type backed by a package-private runtime
implementation; the package root exposes no token constructor or issuer. The
adapter separately exposes an opaque `deliveryAuthority` capability which must
be supplied to its browser controller. Admission consults that capability
before reading or canceling an event, so a look-alike, foreign-adapter, stale,
or already-spent token cannot submit work, suppress a keyboard/clipboard echo,
consume an echo receipt, or call `preventDefault()`.

A token authorizes at most one attempted sequence. It is spent after complete
request preflight and before the first generated Wasm call, including when the
call later rejects or throws. Tokens are never refreshed, rebound to a newer
projection, replayed, cloned across adapters, or serialized.

## Event ownership

`BreditorBrowserEventController` accepts only events targeted at its connected
light-DOM host or descendants. Events from another document, another host, a
nested form control, or a nested editing host are left alone. The controller
does not use global platform sniffing and does not infer an operating system.
A detached host is outside the admission boundary even when its old renderer
handle and DOM subtree still exist.

The host chooses a keyboard policy:

- `beforeinputPrimary` leaves structural editing keys to `beforeinput`;
- `structuralFallback` may handle Backspace, Delete, and Enter at `keydown`;
- `control` or `meta` selects the primary shortcut modifier explicitly; and
- editor shortcuts may be enabled or disabled independently.

Text is never derived from `keydown`. AltGraph, dead keys, `Process`, key code
229, and any active composition evidence remain native composition work.
Clipboard keyboard chords remain native until the actual copy, cut, or paste
event supplies the clipboard capability.

An owned cancelable event is canceled before its command enters the queue. If
`preventDefault()` fails, if the event is noncancelable, or if access to native
fields throws, no semantic command is submitted and the caller receives an
explicit reconciliation result. Unsupported cancelable editing intents are
canceled and reported as blocked rather than silently changing the DOM.

## Supported non-composition intents

The `0.0.53` translator intentionally recognizes a narrow set:

- `insertText` and `insertReplacementText` -> `breditor/insert-text`, or
  `breditor/insert-plain-text` when the value contains a line break;
- `insertParagraph` -> `breditor/insert-paragraph-break`;
- `deleteContentBackward` -> `breditor/delete-backward`;
- `deleteContentForward` -> `breditor/delete-forward`;
- `deleteContent` -> `breditor/delete-selection`;
- `formatBold` -> `breditor/toggle-strong`;
- `historyUndo` and `historyRedo` -> guarded history commands; and
- `deleteByCut`, `insertFromPaste`, and `insertFromPasteAsQuotation` ->
  clipboard-echo classification only.

Soft-line breaks, word/line deletion, rich formatting, lists, indentation,
links, drag/drop, spellcheck replacement variants, and unknown input types are
not approximated by a different action. The closed set can grow by adding an
explicit semantic action and a deliberate translation rule; the open browser
`inputType` string is not treated as a closed WebIDL enum.

Browser-originated string payloads must be nonempty valid Unicode scalar text
and fit both a 65,536 UTF-16-code-unit ceiling and a 65,536 UTF-8-byte ceiling.
Line-ending normalization and the final document/action limits remain Rust
responsibilities.

## Selection and target ranges

Every executable browser event captures one exact directional semantic range
through the same `BreditorDomSelectionBridge` owned by the command adapter.
Missing focus, an unavailable DOM range, multiple ranges, DOM drift, or an
ambiguous point blocks the command; it is never reinterpreted as a request to
clear semantic selection. Explicit selection absence exists only for trusted
API integrations.

`InputEvent.getTargetRanges()` is read synchronously and bounded to zero or one
range. One range is normalized immediately into a directionless
`BaseTargetRange`; no native range or endpoint is retained. The target is tied
to the exact projection, renderer handle, and renderer generation.

Replacement and ordinary range-targeting intents require the normalized target
to equal the spatial extent of the captured selection. Collapsed backward and
forward deletion validate a supplied browser target but do not adopt it: Rust's
grapheme-aware actions own the actual deletion boundary. History commands
require no target range. Multiple, detached, cross-host, reversed, stale, or
noncanonical targets fail closed.

## Exact-once echoes

Some browsers emit more than one event for one physical edit. Breditor uses
small, one-use receipts rather than executing each signal:

- a structural or shortcut command executed at `keydown` can consume one
  matching `beforeinput` echo;
- a cut or paste event can consume one matching clipboard `beforeinput` echo;
- the following matching `input` is accepted only as a postcondition; and
- a mismatch, unrelated event, generation change, invalid target, or lifecycle
  boundary clears the receipt.

Receipts contain bounded command identity and exact render correlation. They do
not retain events or clipboard payloads. Two independent `beforeinput` events
remain two commands even when their payloads happen to be equal.

## Queue contract

`BreditorCommandQueue` is a bounded synchronous FIFO. The default capacity is
256 and the hard maximum is 4,096, including the currently executing item.
Reentrant submissions append and return `queued`; the executor is never called
recursively. A promise-like executor result is rejected because native event
cancellation, observation guards, and selection/render correlation require a
synchronous boundary.

If an executor or delivery observer throws, the queue records the exact sequence
at which outcome became uncertain and permanently quarantines later items. It
never retries the head or assumes that a throw means Rust did not publish. A
new integration may start only after reconciling from authoritative engine
state. The observer is notification-only: raw Wasm projection updates and
generated handles never reach it.

## Wasm adapter ownership

`BreditorWasmCommandAdapter` exclusively owns:

- the current generated observation handle;
- its copied lineage and full-width revision;
- the matching browser projection and renderer handle;
- the renderer and selection bridge which produced that handle;
- private token authority and delivery epoch; and
- a closed lifecycle: `live`, `executing`, `reconcile`, `faulted`, or
  `disposed`.

For each sequence the adapter validates the request and selection scalars, spends
the token, synchronizes selection, optionally closes the history group, and
executes the command. Every generated result is shape-checked and every returned
handle is checked for aliasing before ownership moves.

The following successor laws are mandatory:

- selection, action, undo, and redo commits retain the lineage and advance the
  revision by exactly one, with an exact-base projection update whose result
  equals the successor observation;
- an effective history-group close has the identical visible snapshot and no
  projection update;
- disabled and unchanged outcomes preserve the complete visible snapshot and
  expose no projection update; and
- a disabled action reports the exact requested action identity.

The adapter consumes and frees an update, converts it into a branded browser
transition, renders it, reads the core's exact resulting selection, and restores
that selection before returning a deeply frozen, generated-handle-free outcome.
Old results and observations are independently freed. Handle aliasing, malformed
results, stale structured errors, generated glue throws, or cleanup failures
fault the adapter and fail the queue.

When Rust has produced a valid correlated successor but DOM publication or
selection installation fails, the adapter retains that authoritative successor
and projection in `reconcile`. `restoreCanonicalRender()` performs an explicit
full render and selection restore. The semantic action is never retried.

## Clipboard staging

Version `0.0.53` recognizes actual copy, cut, and paste events and submits a
staged clipboard request. A cut request deliberately contains no eager delete;
a paste request contains no untrusted payload. Clipboard serialization,
allowlisted HTML parsing, `DataTransfer` writes/reads, and the final atomic
delete/insert command are the separate `0.0.55` contract.

An integration must route staged requests to its clipboard executor and engine
requests to `BreditorWasmCommandAdapter.execute`. Sending a staged request to the
Wasm command adapter is a controlled type/runtime rejection, never a document
mutation.

## Atomicity and recovery limits

One delivery is non-interleaved, but it is not a rollback transaction spanning
all browser and core work. Selection synchronization can commit before the
final action. An explicit history-group close can also remain effective if the
later action returns an error. DOM APIs cannot participate in a Rust transaction.
Consequently an uncertain later failure quarantines the queue and requires
reconciliation; it does not roll back or retry already published prestages.

Other intentional limits in `0.0.53`:

- one connected light-DOM host and one range selection;
- no shadow-DOM composed-path ownership;
- no asynchronous command executor;
- no generic browser DOM-to-AST parser;
- no direct persistence append in the event callback;
- full DOM validation and projection/selection conversion remain linear in the
  bounded document; and
- composition events are only classified and delegated. The temporary DOM
  lease, settlement, cancellation, and IME reconciliation arrive in `0.0.54`.

## Acceptance laws

The release tests establish at least:

1. one physical keydown/beforeinput/input sequence produces at most one command;
2. two independent same-looking `beforeinput` events remain two FIFO entries;
3. cut and paste echoes require an exact one-use receipt;
4. text, paragraph, grapheme deletion, selection deletion, bold, undo, and redo
   translate only to their declared semantic commands;
5. composition evidence never becomes an ordinary command;
6. selection and target ranges are captured against the same exact render;
7. unsupported, noncancelable, hostile, foreign, stale, and DOM-drifted events
   fail with controlled dispositions;
8. rejected delivery authority and disconnected hosts leave native events
   uncanceled, and rejected authority does not consume an existing echo receipt;
9. queue reentrancy preserves FIFO order without recursive execution;
10. executor/observer uncertainty fail-stops the queue without replay; and
11. generated result/update/selection ownership is consumed exactly once and
    only exact correlated successors become adapter state.
