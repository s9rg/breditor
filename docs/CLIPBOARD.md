# Breditor clipboard contract

Status: supported by the public `0.1.0` runtime for the closed base schema and
extended by the experimental `0.2.0-alpha.7` compiled-profile browser path;
direct controller construction remains an advanced integration surface

This is Breditor's own clipboard protocol. ProseMirror, Lexical, Tiptap, and
CKEditor are design references only; Breditor does not adopt their slice,
transaction, schema, plugin, or internal clipboard formats.

The Rust AST is authoritative. Copy is a projection of an exact semantic
selection, cut is that same projection followed by one guarded Rust deletion,
and paste reduces one native clipboard representation to bounded plain text
before one guarded Rust insertion. Clipboard HTML is never installed in the
editor DOM and is never treated as an AST.

## Ownership and ordering

`BreditorClipboardController` owns synchronous `copy`, `cut`, and `paste`
callbacks for one adapter-compatible surface and the queue constructed from its
exact stable executor. It also owns the optional
`beforeinput` and `input` echoes for a successfully committed cut or paste.
The integration must construct its `BreditorCommandQueue` with the same captured
`commandExecutor`; a forwarding function or a queue subclass override cannot
open or impersonate the package-private lease port. The TypeScript adapter
argument and its mutable JavaScript surface are host-trusted wiring at this
low-level checkpoint, not an authorization boundary against same-origin code.

Before reading an event, `DataTransfer`, clipboard payload, cancellation state,
or DOM selection, the controller reserves a completely idle queue. While the
lease exists, ordinary events, toolbar/API calls, observers, and reentrant
clipboard callbacks cannot submit work through that queue. Direct out-of-band
adapter execution is an integration violation which the lease cannot prevent;
a change is detected by the next base check and produces a partial-state
reconciliation result. The callback proves a connected, current, canonical
light-DOM render, captures one exact semantic range through the adapter-owned
selection bridge, and revalidates the base around each effectful clipboard
read, write, cancellation, and command boundary.

For a genuine `ClipboardEvent`, Alpha.6 reads `clipboardData` through the
brand-checked realm prototype and reads or mutates a branded `DataTransfer`
through its native `types`, `getData`, `clearData`, and `setData` members. Event
cancellation likewise uses the native `Event` method and getter. Own and
intermediate-prototype shadows are ignored, a generic `Event` cannot impersonate
a `ClipboardEvent`, and advertised MIME types are copied from at most 64 dense
own data elements without executing indexed accessors or a custom iterator. The
advanced controller retains a structural path for explicit host-trusted
fixtures. These checks are not a same-origin sandbox: the adapter wiring and
replacement of the realm's actual platform globals or prototypes remain trusted
integration behavior.

The closed sequences are:

```text
copy:  lease -> semantic selection -> serialize -> clear clipboard
       -> write text/plain -> write text/html -> cancel native copy -> release

cut:   lease -> semantic selection -> serialize -> clear clipboard
       -> write text/plain -> write text/html -> cancel native cut
       -> one close-before delete-selection command -> receipt -> release

paste: lease -> semantic selection -> inspect advertised MIME types
       -> read one representation -> sanitize/validate -> cancel native paste
       -> one close-before insert-plain-text command -> receipt -> release
```

Copy never submits an engine command. A collapsed copy or cut performs no Rust
mutation. Paste at a collapsed caret is an ordinary insertion and does submit.
Cut does not delete until both clipboard representations are written and native
mutation is confirmed canceled. Paste does not insert until its selected
representation is fully reduced and native mutation is confirmed canceled.

Every public controller disposition is deeply frozen and payload-redacted.
Neither a native event, DOM node, DOM selection, `DataTransfer`, generated Wasm
handle, callback, nor promise enters the queue or an echo receipt. The admitted
paste text intentionally becomes the bounded string-action payload, so the
synchronous queue executor and an application-supplied queue observer can see
and retain it. The package queue itself does not retain that leased request
after the callback returns.

## Semantic copy format

`serializeClipboardSelection` slices the exact projection-bound
`BaseRangeSelection`; it never reads DOM markup. Spatial direction is normalized
only for slicing. UTF-16 offsets remain the browser/core position currency and
must already be valid Unicode-scalar boundaries.

The plain representation joins selected paragraph slices with LF. The HTML
representation uses only attribute-free `<p>` blocks, sole empty-paragraph
`<br>` elements, and the exact canonical wrapper chain from the projection's
checked browser presentation. In the legacy unprofiled path that chain is only
attribute-free `<strong>`; a profiled path may use `code`, `em`, `mark`, `s`,
`span`, `strong`, `sub`, `sup`, or `u` with only the recipe's exact canonical
class value. Caller text is escaped, including carriage return as `&#13;`.
Scalars which strict HTML tokenization reports as controls or
noncharacters are not representable in the paired HTML form: U+0000,
U+0001–U+0008, U+000B, U+000E–U+001F, U+007F–U+009F, U+FDD0–U+FDEF, and each
plane's U+nFFFE/U+nFFFF reject the complete dual-format operation. A selection
containing only a paragraph boundary remains meaningful: it serializes to LF
and two empty paragraphs.

The browser clipboard is first cleared, then `text/plain` is written, then
`text/html`. Failure at any step blocks cut deletion. This ordering gives
external consumers a broadly interoperable representation while preserving
the selected semantic format structure for consumers that accept HTML.

Serialization is bounded by the already bounded base projection plus explicit
output ceilings:

- plain text: 8 MiB plus 9,999 UTF-16 code units and the same UTF-8-byte bound;
- escaped HTML: 64 MiB in both UTF-16 code units and UTF-8 bytes; and
- semantic format wrappers: 200,000 across the complete selection; and
- no ill-formed UTF-16, tokenizer-control scalar, or Unicode noncharacter in
  the selected HTML representation.

The HTML ceiling is intentionally conservative for worst-case escaping. These
large synchronous limits are correctness ceilings, not a claim that near-limit
clipboard operations have desirable UI latency. They are also deliberately
asymmetric: one copy or cut can publish roughly 8 MiB of plain text, but the
current atomic paste action accepts at most 65,536 UTF-16 code units and 65,536
UTF-8 bytes. Breditor can therefore copy or cut a selection that it cannot paste
back as one action; undo remains the recovery path for an oversized cut.

## Paste representation policy

Advertised `text/plain` is authoritative. If it is present, Breditor reads only
that item; an empty, invalid, throwing, or oversized plain item fails closed and
does not fall back to HTML. This prevents an attacker from steering validation
by supplying a deliberately broken preferred form. `text/html` is consulted
only when plain text is absent. Other MIME types, files, and objects are not
accepted.

Plain text still passes the shared command-string limits before reaching Rust.
HTML is parsed with `parse5` without creating browser DOM nodes. The complete
repaired fragment must fit this closed allowlist:

- direct HTML-namespace, attribute-free `<p>` blocks;
- non-empty direct text runs and, for the unprofiled path, one attribute-free
  `<strong>` or `<b>` wrapper;
- for a profiled path, only exact tag/class signatures from its checked
  presentation in canonical outer-to-inner order, with at most 32 wrappers per
  run;
- an empty paragraph with no children or one sole attribute-free `<br>`; and
- optionally, exact `StartFragment` and `EndFragment` comments surrounding all
  paragraphs.

Surviving attributes beyond one exact recipe class, styles, links, scripts,
images, lists, tables, headings, unknown elements, foreign namespaces,
noncanonical wrapper nesting, extra comments, and adjacent runs with the same
complete format set are rejected. Parser errors are
rejected except for the precisely audited control-character references emitted
by Breditor's own carriage-return serializer. The allowlist is applied to
parse5's repaired tree, not to a newly invented HTML source grammar. Source
wrappers or attributes which the HTML fragment parser discards do not survive
to admission and therefore do not cause rejection; for example, an ignored
`<html>`/`<body>` wrapper around an otherwise exact `<p>` is not source-level
evidence retained by this policy.

Admitted paragraphs are flattened with LF separators. Strong markup is
deliberately discarded on paste because the current atomic multiline action
accepts one plain string in the insertion context; mixed clipboard formatting
cannot be represented honestly by that action yet.

HTML admission limits are 2 MiB of source in both UTF-16 and UTF-8, 65,536
inspected nodes, legacy depth three, profiled depth 34
(`fragment -> p -> 32 wrappers -> text`), 10,000 paragraphs, and the shared
65,536-unit/byte command result limit. Empty final
text is rejected, while multiple empty paragraphs can produce a meaningful LF
sequence. An instrumented parse5 tree adapter also aborts during construction
when transient nodes, repair mutations, or the open-element stack cross fixed
budgets; the final repaired-tree walk still enforces the tighter public limits.

## Echoes and integration boundary

A committed cut or paste records one exact post-command receipt bound to the
adapter's new render, projection, delivery token, and operation. One matching
clipboard `beforeinput` can consume it and be canceled; one following matching
`input` is accepted only as a postcondition. Browsers that omit the
`beforeinput` can consume the matching receipt directly at `input`. Mismatch,
composition evidence, render/delivery change, any newly attempted clipboard operation,
explicit `forgetEchoReceipt()`, or disposal invalidates the receipt. No echo
executes a second Rust command.

Version `0.0.55` intentionally introduced separate ordinary, composition, and
clipboard controllers. The unified router added in `0.0.58` now front-routes
actual clipboard events and clipboard-shaped
`beforeinput`/`input` (`deleteByCut`, `insertFromPaste`, and
`insertFromPasteAsQuotation`) to the clipboard controller. The ordinary event
controller returns `clipboardOwns` for those input types and does not also see
them as executable edits. Advanced integrations assembling the controllers
themselves must preserve the same precedence.

## Atomicity and failure states

The OS clipboard, browser cancellation, Rust state, DOM projection, and DOM
selection do not share a rollback transaction. Breditor therefore chooses the
safe direction for known failures:

- copy/cut serialization failure causes no semantic deletion;
- partial clipboard write failure attempts to cancel native mutation and never
  deletes;
- paste read/sanitization failure attempts to cancel and never inserts;
- cancellation failure submits no command and requires reconciliation; and
- uncertainty after command submission is never retried.

A failed cut may consequently leave newly copied data without deleting the
selection. A failed paste may leave the native event canceled without inserting
anything. If the queue executor or observer throws, or a committed successor
cannot be correlated to a fresh render, the result reports reconciliation
required and callers must use the adapter's canonical recovery path.

## Deliberate limitations

The alpha.6 contract does not provide the asynchronous Clipboard API,
permission prompts, programmatic clipboard buttons, files, images, URI lists,
custom internal MIME, rich mixed-format paste, source application metadata,
cross-block structure beyond direct paragraphs, shadow/composed ownership,
multi-range selection, or a generic HTML sanitizer. It supports one connected
light-DOM editor and synchronous `ClipboardEvent.clipboardData` only.

The low-level controller accepts the TypeScript adapter surface structurally.
Application code must not forge, proxy, or mutate that wiring and must route all
normal commands through the shared queue. The public high-level runtime
encapsulates these pieces so ordinary consumers cannot bypass their coordination
accidentally.

Synthetic DOM tests establish the deterministic ownership and failure laws but
do not alone claim browser interoperability. The `0.1.0` Playwright release
gate, introduced at checkpoint `0.0.59`, dispatches the supported synchronous
clipboard-event capability in Chromium, Firefox, and WebKit, including
plain-text precedence and admitted HTML-only flattening. It does not exercise
OS clipboard permissions, browser chrome, or the async Clipboard API. See
[browser support and accessibility](BROWSER_SUPPORT_AND_ACCESSIBILITY.md).

## Research basis

The boundary follows the platform event model described by the
[Clipboard API and events specification](https://www.w3.org/TR/clipboard-apis/)
and the clipboard-related input types described by
[Input Events Level 2](https://www.w3.org/TR/input-events-2/). The expected
multi-event shapes are cross-checked against the Web Platform Tests
[cut/paste input-events coverage](https://github.com/web-platform-tests/wpt/blob/master/input-events/input-events-cut-paste.html).
These sources constrain browser behavior; they do not define Breditor's AST,
command, selection, history, or receipt protocol.
