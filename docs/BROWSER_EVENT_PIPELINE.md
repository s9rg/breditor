# Breditor browser event pipeline

Status: supported inside the public `0.1.0` runtime for the closed base schema,
retained by the supported `0.2.0` compiled-profile and intent path, and
strengthened in `0.3.0-alpha.3` by Rust-atomic close-before command execution;
the `0.3.0-alpha.6` typed multi-paragraph setter uses the same event protocol;
the alpha.12 RGB24 and alpha.13 Text Size typed setters use that existing
programmatic/toolbar route and add no native editable-host input translation;
direct event-controller assembly remains an advanced integration surface

This is Breditor's own browser-to-core command contract. ProseMirror, Lexical,
Tiptap, and CKEditor remain research references; their event, transaction,
selection, plugin, and DOM-reconciliation protocols are not adopted.

The Rust AST remains authoritative. Outside an explicitly leased composition
session, an owned browser mutation is either canceled before the DOM changes or
reported as requiring canonical reconciliation. During composition, temporary
native DOM is evidence only; it is never adopted as an AST or authoritative
state. Native `input` is either a postcondition or terminal composition evidence
and never causes a second semantic command for the same physical edit.

## Delivery sequence

One executable browser command is derived and delivered synchronously as:

```text
native event
  -> bounded scalar snapshot + exact semantic selection
  -> immutable command request + one-use delivery token
  -> bounded non-recursive FIFO
  -> guarded Rust selection synchronization
  -> one Rust-atomic optional history-group close plus exactly one
     semantic intent, action, undo, or redo
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

The supported listener path receives genuine platform events. Alpha.6 reads
base `Event` facts and specialized `InputEvent`, `KeyboardEvent`,
`CompositionEvent`, `ClipboardEvent`, and `MouseEvent` facts through
brand-checked getters and methods from the realm's platform prototype chain.
Own and intermediate-prototype shadows are ignored, a generic native `Event`
cannot impersonate a specialized event, and cancellation calls the native
`Event.prototype.preventDefault` method and confirms its native
`defaultPrevented` result. A direct advanced-controller call may instead use the
explicit structural path needed by host-trusted fixtures. This is not a
same-origin sandbox: replacement of the realm's actual platform globals or
prototypes remains host-trusted behavior.

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
- `formatBold` -> the no-input `breditor/format-strong` intent, whose frozen
  blocking route selects `breditor/toggle-strong`;
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

Alpha.5 does not add an input type or translation rule. It enables the existing
Enter, multiline insertion, cross-paragraph type-over/delete, boundary-delete,
and property-free toggle commands under a Bootstrap-V2 typed profile because
their Rust `ParagraphSplit`, `ParagraphJoin`, and `RootTextReplace` plans now
preserve complete typed peer formats. `SetInlineFormatAction` remains absent
from native-event translation and remains same-paragraph through the strict
programmatic typed-intent path. Clipboard paste still supplies plain text only;
destination context can contribute a typed format to inserted text, but source
formatting never crosses the command request.

Alpha.6 changes no native-event translation. An application can submit the
existing strict typed set/remove intent while a multi-paragraph semantic
selection is retained. That request enters the same immediate queue and Rust
returns one guarded root-replacement result; the browser neither expands it
into per-paragraph commands nor recreates activation, limits, or selection
mapping.

Alpha.12 changes no native-event translation either. Its native
`<input type="color">` belongs to the sibling toolbar form, not the editable
host. Apply and Remove submit the existing strict typed intent through the same
preserved-selection queue; no `beforeinput` color type, DOM mutation, shortcut,
or CSS payload is introduced. A collapsed application changes pending typing
formats under the existing operation-free history-boundary law, while a range
application produces the existing generic undoable operation.

Alpha.13 has the same boundary. Its native `<select>` belongs to the sibling
toolbar form, retains native focus and Arrow-key behavior, and submits Apply or
Reset through the same preserved-selection queue. It introduces no
`beforeinput` size type, editable-host DOM mutation, typed-value shortcut, CSS
payload, or Text Size-specific semantic command. See
[`TEXT_SIZE_PRESETS.md`](TEXT_SIZE_PRESETS.md).

## Selection and target ranges

Every executable browser event captures one exact directional semantic range
through the same `BreditorDomSelectionBridge` owned by the command adapter.
Missing focus, an unavailable DOM range, multiple ranges, DOM drift, or an
ambiguous point blocks the command; it is never reinterpreted as a request to
clear semantic selection. Explicit selection absence exists only for trusted
API integrations.

`InputEvent.getTargetRanges()` is invoked through the branded native method and
its result is copied from at most one dense own-data array element without
executing an indexed accessor or custom iterator. One branded `AbstractRange`,
`Range`, or `StaticRange` is normalized immediately through native endpoint
getters into a directionless `BaseTargetRange`; a structural look-alike cannot
supply endpoints. No native range or endpoint is retained. The target is tied
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

A keyboard receipt is armed only for the conventional primary+B/`formatBold`,
primary+Z/`historyUndo`, primary+Shift+Z/`historyRedo`, and
Control+Y/`historyRedo` pairs. Meta+Y and arbitrary semantic aliases do not arm
one. If the browser emits no matching `beforeinput`, the receipt expires at the
end of the current task; it cannot suppress a later independent event.

## Composition and IME ownership (`0.0.54`)

`BreditorCompositionController` is the explicit owner of one admitted native
composition interval. It is separate from `BreditorBrowserEventController`;
`0.0.54` does not provide a unified end-user event router. An integration must
front-route owned `compositionstart`, `compositionupdate`, `compositionend`,
composition-related `beforeinput`/`input`, `keydown`, and `blur` signals to the
composition controller and must not send the same active-composition signal
through the ordinary command path.

Admission requires a connected, canonical light-DOM render and exactly one
mapped DOM range selection. The controller synchronously captures that semantic
range, acquires an idle queue lease, and asks the adapter for a private,
nonzero-session composition token bound to the exact projection, rendered
handle, selection object, snapshot, adapter authority, and observation epoch.
The adapter then enters `composition`: ordinary delivery tokens, direct
`execute` calls, and ordinary queue submissions cannot authorize work.
The closed happy-path phases advance from `idle` through `armed`, `leased`,
`mutating`, `ending`, and `settling`, then return to `idle`. Any unprovable
active transition goes to `quarantined` until canonical recovery succeeds.

The first accepted composition `beforeinput` must expose exactly one target
range. While the DOM is still canonical, the controller maps it, requires both
endpoints to stay in one paragraph, replaces the captured lease range exactly
once, and opens an opaque renderer-owned DOM lease. Opening disconnects the
renderer mutation observer and makes the public render non-current and its AST
mappings unavailable, while retaining exact ownership of the host for later
restoration. Only then may the browser mutate the temporary composition DOM.
No native event, target-range object, DOM `Selection`, or event-derived DOM node
is retained as composition evidence.

### Event order and bounded mobile aliases

The state machine does not assume one disputed browser ordering. It accepts an
explicit `compositionstart`, including `compositionupdate` before the first
composition `beforeinput`; it can also start implicitly from a composition
`beforeinput` and coalesce a later `compositionstart`. The standard admitted
input types are `insertCompositionText`, `deleteCompositionText`,
`insertFromComposition`, and `deleteByComposition`, including reconversion
deletion before `compositionstart`.

Within an admitted composition, the controller also recognizes the bounded
mobile-shaped aliases `insertText`, `deleteContentBackward`, and
`deleteContentForward`. Such a `beforeinput` can establish an implicit session
only when its native `isComposing` flag is true; an `input` alias with
`isComposing === false` is terminal evidence. These aliases are compatibility
rules for those exact signals, not a claim of general Android, iOS, virtual-
keyboard, or handwriting support.

`compositionupdate` and composing input are provisional evidence.
`compositionend`, `insertFromComposition`, and the admitted non-composing final
input forms can end the interval. Duplicate terminal signals are idempotent;
conflicting final text is not guessed. One owned keydown immediately after
terminal evidence may force the pending settlement before the scheduled
callback. After success, one exact matching late terminal `input` echo can be
consumed; a different payload, render generation, delivery epoch, new
composition, or next scheduled task invalidates that receipt.

Blur schedules closure but is not final text evidence: unchanged DOM may cancel,
while changed provisional DOM is discarded through recovery rather than
committed.

### Settlement, cancellation, and recovery

Normal settlement occurs at a later task boundary so the browser can finish its
native DOM work. The scheduling hook itself is synchronous and returns `void`,
but it must enqueue the callback for a future task; invoking it inline is
rejected. The default uses a 20 ms timer. Command execution and leased queue
delivery remain synchronous and promise-free.

At settlement every paragraph element must still be an attribute-free `<p>`,
and every non-target paragraph must remain canonical at the DOM projection
level, including its resolved wrapper attributes. The one target paragraph may
be empty, use one sole attribute-free `<br>` to represent empty text, or contain
text under a monotonically ordered subset of the exact checked presentation
wrappers. Property-free wrappers retain only their canonical class;
`safeLinkV1` wrappers admit only the inert, canonical href-only, or canonical
href/rel/target shapes. Those wrappers and attributes are structural evidence
only and are discarded when the replacement text is submitted to Rust. Text
outside the captured replacement range must match the authoritative projection
exactly. The extracted replacement is bounded valid Unicode. Composition event
text and the extracted candidate each fit both the 65,536 UTF-16-code-unit and
65,536 UTF-8-byte ceilings; transient dynamic attribute values share a 1 MiB
UTF-8 work budget before URL validation.
Cross-paragraph replacement, changed surrounding text, unknown or noncanonical
attributes, comments, unknown wrappers, invalid wrapper order or depth,
unrelated host changes, or conflicting event evidence fail closed. This is
strict reconciliation of one known replacement, not a generic DOM-to-AST or
HTML parser.

Before any semantic command is delivered, the adapter spends the composition
token, discards the temporary DOM through a full render of the authoritative
projection, and restores the exact captured semantic selection. That restoration
makes no Wasm call and cannot mutate Rust. The controller then spends the exact
queue lease on one request:

- committed replacement text uses `breditor/insert-plain-text` with
  `closeBefore`;
- an observed empty replacement of a non-empty range uses
  `breditor/delete-selection` with `closeBefore`; and
- cancellation submits an explicit `closeHistoryGroup` control, including when
  the visible document was unchanged.

Every successful insert, delete, or cancellation settlement therefore closes
the prior typing history group; cancellation is a history boundary too. Abort
recovery makes no Rust call and does not close history. For insertion and
deletion, Rust runs the requested close and action on one checkpointed candidate;
an action or checkpoint error publishes neither. Cancellation remains a
standalone close command. The native IME DOM is never the committed value: only
the resulting guarded Rust action can publish the candidate.

Strict restoration requires the exact live composition token and, once native
mutation opened, the exact renderer DOM lease. A stale, foreign, refined-away,
or replayed token is inert. If render ownership was externally superseded,
released, disconnected, or otherwise cannot prove strict settlement, the
controller quarantines first and defers recovery. The adapter's exact-token
recovery path spends the lease before effects, best-effort discards any renderer
lease, full-renders its retained authoritative projection, and rewrites the
captured selection without calling Rust. If that also fails, the controller
stays quarantined and the queue remains leased; it neither retries a command nor
releases ordinary work onto uncertain DOM. Disposal follows the same restore-
before-release rule. Exposed failures use stable payload-redacted reasons.

### Composition limits

The `0.0.54` composition slice deliberately supports one connected light-DOM
host, one browser range, one target range, and one paragraph-local replacement.
The `0.2.0` profile path admits its exact checked wrapper vocabulary, and the
unpublished `0.3.0-alpha.4` path also admits the closed `safeLinkV1` attribute
shapes described above. It does not support cross-block composition,
shadow/composed ranges, browser multi-range selection, nested editable
controls, arbitrary native IME markup, or an asynchronous executor. The
temporary target DOM vocabulary remains closed to plain text, the
empty-paragraph placeholder, and presentation-owned wrappers in canonical
order; all wrapper semantics are flattened before the Rust command.

The scheduler and controller are covered by deterministic DOM unit tests. The
`0.1.0` Playwright release gate, introduced at checkpoint `0.0.59`, also
exercises their full event/temporary-DOM settlement path with synthetic
composition in Chromium, Firefox, and WebKit. Synthetic composition does not
prove operating-system IME behavior; real Japanese, Korean, Chinese, Indic,
handwriting, dictation, autocorrect, and mobile-device input remain manual
checks. See
[browser support and accessibility](BROWSER_SUPPORT_AND_ACCESSIBILITY.md).

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

Composition reserves a queue only when it is completely idle. The queue must
have been constructed with the exact stable `adapter.commandExecutor` function;
a wrapper which merely calls that function is not equivalent. While reserved,
ordinary toolbar, API, event, observer, and reentrant submissions reject as
`leased` before request inspection. The exact lease permits one synchronous,
never-queued settlement submission and remains held until canonical restoration
and settlement or explicit recovery have completed.

Alpha.7's public `executeIntent()` uses the same lease primitive for a separate
immediate-only guarantee. It acquires only while the queue is idle and the
adapter is live, submits one no-input intent synchronously, and releases before
returning. Active delivery, authoritative reads, composition, and reentrant
public calls return busy instead of enqueueing stale authority. An uncertain
submission faults the high-level owner and is never retried.

## Wasm adapter ownership

`BreditorWasmCommandAdapter` exclusively owns:

- the current generated observation handle;
- its copied lineage and full-width revision;
- the matching browser projection and renderer handle;
- the renderer and selection bridge which produced that handle;
- private token authority and delivery epoch; and
- a bounded handle-free observer set for exact adopted Rust commits;
- a closed lifecycle: `live`, `composition`, `executing`, `reconcile`,
  `faulted`, or `disposed`.

For each sequence the adapter validates the request and selection scalars,
spends the token, and synchronizes selection. It then passes the request's
`closeBefore` choice into the one action, intent, undo, or redo call. Rust runs
that boundary and command on one private checkpointed candidate and publishes
both or neither. Every generated result is shape-checked and every returned
handle is checked for aliasing before ownership moves.

The following successor laws are mandatory:

- selection, action, intent, undo, and redo commits retain the lineage and advance the
  revision by exactly one, with an exact-base projection update whose result
  equals the successor observation;
- an effective history-group close is reported by
  `historyGroupClosedBefore`, retains the identical visible document snapshot,
  and has no projection update of its own;
- disabled and unchanged outcomes preserve the complete visible snapshot and
  expose no projection update; and
- a disabled action reports the exact requested action identity.

An intent outcome repeats its requested intent and exact routed provenance.
The advanced adapter retains selected binding/action and fallthrough details;
the package-root editor redacts those details to the requested intent,
committed/blocked/unhandled status, authoritative document snapshot, and the
stable blocked reason/activation when applicable.

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

Every validated `committed` successor is published to the adapter's
notification-only core-commit feed immediately after adoption and before a
later cleanup or reconciliation error can escape. This includes same-revision
history-group boundaries reported as part of an adopted combined result and
separate selection prestages whose later command fails. Autosave uses this feed
because a command-queue observer sees only successful whole deliveries.
Observer failure is contained; reads and other work must be deferred while the
adapter remains in its execution lease.

## Clipboard ownership (`0.0.55`)

`BreditorClipboardController` owns synchronous copy, cut, paste, and their
optional `beforeinput`/`input` echoes for the supplied adapter surface. It
reserves the idle queue constructed from that surface's same captured executor
before reading any event or clipboard capability.
Copy serializes the semantic selection without a Rust command. Cut writes both
plain and closed-vocabulary HTML forms and confirms cancellation before one
selection-delete action. Paste gives advertised plain text precedence; only
when plain text is absent may strict allowlisted HTML be parsed and flattened
before one atomic multiline plain-text insertion.

Native `Event` and `DataTransfer` objects never enter a command or receipt. The
admitted paste string deliberately becomes the bounded action payload and is
therefore visible to the synchronous queue executor and any application queue
observer. The ordinary controller delegates clipboard-shaped `beforeinput` and
`input` signals with `clipboardOwns`. The high-level owner now front-routes those
signals and actual clipboard events through the unified router; advanced
integrations must preserve that precedence. See
[the complete clipboard contract](CLIPBOARD.md) for formats, resource limits,
failure states, and deliberately unsupported content.

## Atomicity and recovery limits

One delivery is non-interleaved, but it is not a rollback transaction spanning
all browser and core work. Selection synchronization can commit before the
final command. The requested history-group close and following action, intent,
undo, or redo are one Rust publication: a command or checkpoint error discards
both, while an effective close may accompany a disabled, unchanged, blocked, or
unhandled result. DOM APIs cannot participate in the Rust transaction.
Consequently an uncertain later browser failure quarantines the queue and
requires reconciliation; it does not roll back or retry an already published
selection or combined command result.

## Selection-change and toolbar policy (`0.0.56`)

A real document `selectionchange` is semantic input and enters the same FIFO as
editing commands. The controller requires the exact live delivery/render base,
maps and revalidates one canonical in-host range, and submits a dedicated
`selection/synchronize` request. An exact programmatic echo is consumed without
another Rust call. No DOM range or a range wholly outside the host is a focus
observation: it deliberately preserves the last core selection rather than
turning blur or toolbar focus into semantic absence.

Toolbar commands use the complementary `selection: preserve` policy. They do
not read, clear, prestage, or write DOM selection before execution; the current
Rust selection remains the command target. `toolbarCommandRequest` converts a
validated declarative control into an ordinary queue request, and Rust still
revalidates availability at execution time. Action-state display and toolbar
interaction details are specified in [the toolbar contract](TOOLBAR.md).

Other intentional `0.1.0` limits:

- one connected light-DOM host and one range selection;
- no shadow-DOM composed-path ownership;
- no asynchronous command executor;
- no generic browser DOM-to-AST parser;
- no asynchronous Clipboard API, custom/internal MIME, or rich mixed-format
  paste;
- no direct persistence I/O in an event or commit callback; the callback only
  advances the autosave dirty epoch;
- full DOM validation, projection/selection conversion, and composition
  reconciliation remain linear in the bounded document; and
- the high-level owner installs the unified event router, and the `0.1.0`
  release suite exercises it in Chromium, Firefox, and WebKit; the
  linked browser-support gate records the completed validation and its claim
  boundary.

## Acceptance laws

The release tests establish at least:

1. one physical keydown/beforeinput/input sequence produces at most one command;
2. two independent same-looking `beforeinput` events remain two FIFO entries;
3. cut and paste echoes require an exact one-use receipt;
4. text, paragraph, grapheme deletion, selection deletion, bold, undo, and redo
   translate only to their declared semantic commands;
5. ordinary delivery never treats composition evidence as a normal typing
   command;
6. selection and target ranges are captured against the same exact render;
7. unsupported, noncancelable, hostile, foreign, stale, and DOM-drifted events
   fail with controlled dispositions;
8. rejected delivery authority and disconnected hosts leave native events
   uncanceled, and rejected authority does not consume an existing echo receipt;
9. queue reentrancy preserves FIFO order without recursive execution;
10. executor/observer uncertainty fail-stops the queue without replay; and
11. generated result/update/selection ownership is consumed exactly once and
    only exact correlated successors become adapter state;
12. a composition reserves only its exact adapter-bound idle queue and excludes
    ordinary, toolbar, API, observer, and reentrant work;
13. native composition DOM is reconciled only as one strict paragraph-local
    replacement and is replaced by the authoritative render before delivery;
14. insert, delete, and cancellation settlements all close the prior history
    group, while recovery alone makes no Rust call;
15. stale, foreign, refined-away, and replayed composition capabilities cannot
    settle or release a lease; and
16. settlement and recovery failures quarantine without retrying a semantic
    command or exposing native composition payloads;
17. each validated adopted core commit emits once independently of whole-queue
    success, while disabled/unchanged results emit nothing; and
18. the in-lease commit observer only advances the dirty epoch and schedules
    later work; checkpoint capture and IndexedDB access occur outside the
    synchronous event/adapter execution lease;
19. clipboard capabilities are touched only under the adapter-executor queue
    lease, so reentrant submissions through that queue cannot interleave work;
20. cut deletion occurs only after both semantic representations are written
    and native mutation is canceled;
21. advertised plain text is authoritative, while HTML-only paste must pass the
    bounded closed allowlist and is reduced to plain text; and
22. a committed cut or paste creates at most one exact echo receipt and never
    executes a second semantic command; and
23. the unchanged Enter/paste/Backspace routes can preserve one exact safe Link
    through structural edits, undo, checkpoint reload with both history
    directions, and redo without a browser-side operation or wire protocol.
