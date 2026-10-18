# Native input rules

Breditor input rules recognize bounded typed shortcuts and prepare ordinary native
edits. They are an explicit behavior policy, not a Markdown parser, document
format, operation protocol or replacement for semantic toolbar commands.

The Rust planner, exclusive local/shared calls and optional Wasm/SDK expose the
first policy. Vanilla and React browser owners enable it only with
`inputRules: "markdown-v1"`. Omission keeps ordinary literal input. Additional
shortcut behavior and final V1 qualification remain unfinished; paste,
composition, programmatic commands and recovery never enable it implicitly.

The [browser and installed-package checkpoint](qualification/2026-10-18-input-rules-browser-installed.json)
passes 27 selected checks, including fresh official runtime builds, independent
installed public imports/types, vanilla/root/React routing, exact reload and
future history. It also reproduces and repairs the shared whole-run replacement
bug below. Native platform qualification, remaining shortcuts and the V1 gates
stay open.

The earlier [exclusive typing and SDK checkpoint](qualification/2026-10-18-exclusive-input-rules-sdk.json)
passes 19 selected checks, including full native regressions, strict lint/docs,
actual rebuilt Wasm, optional SDK types and search regressions. The current
programmatic cases at that checkpoint restore 84 checkpoints in independently
pinned earlier Wasm readers and match 336 subsequent Undo/Redo checkpoints.
That specific compatibility evidence is not a promise that affected older
readers support the whole-run replacement repair described below.

The [native foundation checkpoint](qualification/2026-10-18-native-input-rules.json)
records full Rust regressions, strict lint/docs, wasm32 compilation and exact
earlier-Wasm recovery. It retains the failed runtime-resource staging attempt
and its same-source continuation; it is not a new browser feature or V1 approval.

## Literal input and reversal

Retain each local plain-input event through the ordinary typing path first. A
separately guarded `apply_markdown_input_rule` transformation then creates one
isolated native Undo group. For example, typing a space after `#` retains `# `;
the transformation removes that marker and changes the paragraph to a heading.
One Undo restores `# ` and its exact before-selection/pending formats. It does
not delete the user's trigger, rerun recognition or merge the automatic change
into an adjacent typing burst.

Both local and shared owners use this contract. Ordinary input and its
transformation are distinct accepted changes. A failed transformation cannot
discard already accepted literal input. Report a genuine transformation error;
do not retry the input or silently publish a partial conversion.

## Exclusive typing calls

Automatic hosts must use `insert_plain_text_with_markdown_rules` or
`insert_typing_text_with_markdown_rules` on the local Rust owner, or their
`_guarded` shared equivalents. The exclusive call retains ordinary input and
then attempts its conversion before any host callback or remote publication can
change the target. Do not implement this by invoking ordinary typing, notifying
subscribers and then reading a fresh target for a separate conversion.

The payload-free `RichInputRuleOutcome` distinguishes four results:

- `Unchanged`: empty input; no rule was attempted.
- `Inserted`: literal input committed, but no rule matched.
- `Applied`: input committed and a separately undoable conversion followed it.
- `Refused`: input committed, but rule planning or complete admission failed.
  Keep the literal text and report conversion refusal separately; never retry it.

Only a typing failure returns an outer error and leaves the whole call unchanged.
A nonmatch keeps the natural typing burst open. A successful conversion isolates
its own existing history group. Existing history capacities and retention still
apply; the native publication revision can advance twice in one exclusive call.

Wasm exposes the additive `markdownInputRulesVersion()` / shared
`markdown_input_rules_version()` capability, string version `1`, and separately
named plain/natural methods. Requests are strict bounded JSON with `text` and
`namespace`; natural typing additionally requires canonical decimal `clockMs`.
Read-only/stale observations reject before request parsing. The original
`execute`/`dispatch` unions and all checkpoint meanings remain unchanged.

Both optional SDKs expose `supportsMarkdownInputRules()`,
`insertPlainTextWithMarkdownRules(text, namespace, revision?)` and
`insertTypingTextWithMarkdownRules(text, clockMs, namespace, revision?)`. They
require the complete matching native pair and return the lowercase outcomes
above; older runtimes fail explicitly. The shared SDK notifies subscribers once,
after both native changes finish, and retains its existing reentrancy guard and
remote queue. Calls require a collapsed text caret; they never replace a range.

## Browser startup and input routing

Set `inputRules: "markdown-v1"` in local/shared DOM options or top-level startup
options. React accepts the same policy in `initialOptions`, owned for the current
`sessionKey`. The coordinator captures the choice at mount; mutating an options
object or rerendering the same session does not enable or disable shortcuts.
The option is not a saved setting. Reopening without it keeps literal input,
even when the restored history contains an earlier shortcut conversion.

Browser routing additionally requires `supportsMarkdownInputRouting()`, backed
by native `markdownInputRoutingVersion()` / shared
`markdown_input_routing_version()`, string `1`. This is a separate minimum from
the unchanged programmatic capability. Older programmatic-only, incomplete or
unknown packs reject before mount changes the host. Root factories reject an
unknown policy before acquiring storage or native ownership.

Only one plain local `beforeinput insertText` scalar at an admitted collapsed
text caret invokes the exclusive call. Different, unreadable or multiple target
ranges do not trigger rules. Paste, replacement/autocorrection, remote updates,
composition and node/grid/document/range replacement retain their ordinary
paths. Browser eligibility checks do not recognize Markdown; native planning
does that. Ordinary nontrigger characters take a shared native fast path without
an additional full-view observation read.

The coordinator captures the intended caret before selection synchronization.
It allows exactly the required selection-only publication, then rejects if a
callback changed any further publication or retargeted the caret. Queued work
retains that exact revision and uses the existing bounded queue and remote
holds. A conversion publishes one final browser notification after both native
changes, while Undo still restores the complete literal trigger separately.

`onInputRuleRefused?: () => void` reports accepted literal input whose native
conversion was refused. The status also says the typed text was kept. This is
not a typing failure and must never cause a retry. It is delivered after the
accepted input, not while native insertion and conversion are in progress.

## Shared replacement repair and reader compatibility

The browser exclusion checks exposed an older native bug unrelated to shortcut
recognition: replacing a whole text source could fail while remapping the old
selection. Deletion removes its birth fragment; replacement characters use the
distinct empty fragment in that same source. A valid old endpoint could then
sit at a physical gap that no surviving chunk owned on its captured side.

The fixed reader first keeps every successful original character mapping. Only
for an unresolved endpoint whose preferred fragment has no visible chunks does
it try the same physical gap from the other side, then the known fragment gap.
The retained affinity and coordinates are not rewritten. A floating source-start
`Before` caret remains before replacement text. General-range tests retain the
actual resulting caret, exact recovery/Undo/Redo and concurrent peer characters.

A checkpoint containing such a previously refused whole-run replacement needs
the fixed shared reader. An independently pinned earlier reader still rejects
that case with its original anchor error. Hosts must match room participants and
backup readers to the fixed runtime; downgrading those checkpoints to affected
alpha readers is unsupported. Existing successful mappings, causal writes and
saved record formats remain unchanged. The browser-routing capability declares
the minimum runtime, not a new saved policy or automatic history migration.

## Native shortcut policy

Block rules require an ordinary paragraph and its exact complete prefix from
block start through the caret, ending in an ASCII space. Retained suffix text is
not copied or replaced.

- One through six `#` characters select the corresponding heading rank.
- `-`, `+` or `*` starts a bullet list.
- A canonical positive ordinal followed by `.` or `)` starts an ordered list at
  that ordinal. The existing maximum, 2,147,483,647, remains unchanged. Zero,
  leading zeroes, overflow and negative values stay literal.
- `>` wraps the retained paragraph in a blockquote.
- `[ ]`, `[x]` and `[X]` create an unchecked or checked task.
- Three backticks, optionally followed by a valid native code-language token,
  convert to code. Retained formatted suffix text rejects rather than losing
  styles. The resulting pending formats are explicitly plain.
- `---`, `***` or `___` creates a horizontal rule only when the marker occupies
  the whole block. The original paragraph remains as empty navigation text after
  the rule, with the same identity and a reachable caret.

Quotes, tasks, code and rules need rich grammar 2 or 3. Grammar 1 still supports
headings and ordinary lists. Captions do not accept structural shortcuts. A
required first paragraph/heading in a list or task item may change heading rank,
but is not replaced by a wrapper or code block. Later flow paragraphs can be
wrapped normally. Conversion of an existing list item into a task, adjacent-list
joining and nested automatic shortcuts are follow-up functionality; the policy
does not flatten retained item bodies to approximate them.

Inline rules recognize `**body**` or `__body__` as strong, `*body*` or `_body_` as
emphasis, `~~body~~` as strike and single-backtick delimiters as inline code.
They trigger on the final delimiter scalar, retain body characters and existing
formats, and add the registered property-free standard format. The original
effective pending formats are restored at the resulting caret, so the new format
does not accidentally continue into following input.

An opener must begin the block or follow whitespace or ASCII punctuation other
than the same marker. Odd backslash escaping, empty/whitespace-edged bodies,
line breaks, ambiguous repeated delimiters and intraword openers stay literal.
Recognition does not unescape or normalize body text. Existing code blocks and
inline code/link ranges do not autoformat. General CommonMark parsing, nested
delimiter interpretation, URL autolinking, smart punctuation and arbitrary
host-defined patterns are not implied by this first native policy.

## Planning and admission

`plan_rich_markdown_input_rule(context, document, selection, trigger, namespace)`
returns no match or an opaque `RichInputRulePlan`. A plan retains the exact source
tree and binding, matched kind, stable block identity, scalar-aligned UTF-16
steps, fully admitted candidate and resulting caret. It is a pure read. Cloned
steps or a preview are not owner, writer or permission authority.

Recognition crosses formatting-run boundaries in one block, never joins blocks
or searches DOM text. It retains at most the last 4,096 UTF-16 units for inline
recognition and refuses a source block with more than 8,192 runs. The window floor
advances past a split surrogate. A block rule needs the full prefix, and an
inline opener at a truncated window boundary is not invented. A match spanning
outside that declared recognition window remains literal. Exceeding the run
inspection ceiling is an explicit error. These recognition limits do not bound
independent selection/schema admission and are not a measured latency or
total-heap guarantee.

Every dependent action is captured against its preceding private admitted
snapshot. The complete group and resulting caret are checked again under the
receiving limits before publication. Existing transaction, schema, document,
history, journal and transport ceilings are unchanged.

The host supplies a permanently fresh namespace of at most 90 valid content-ID
bytes. Native planning derives only the required wrapper/item/rule identities.
Unused namespaces are not validated for a nonmatch. Visible collisions reject;
shared preparation additionally rejects historical identity reuse, including
after Undo. A namespace is not a new room, writer, merge clock or permission.

## Local and shared history

`RichLocalSession::apply_markdown_input_rule` checks its exact observation and
current writable policy before planning. It dispatches the captured ordinary
action group with an explicit resulting caret/pending state. Local checkpoints
record admitted forward/inverse edits, not trigger recognition.

`RichReplica::apply_markdown_input_rule_guarded` uses the same pure native plan.
It lowers the steps only into existing guarded causal commands: source-character
deletions, kind changes, retained-body wrappers, rule insertion and original
format annotations. A staged candidate must equal the native preview before
adoption. The original command union, model/journal versions, protocol defaults
and existing original/general/document, natural, reviewed and search save
families retain their meanings. There is no input-rule history upgrade or
automatic migration.

A nonmatch leaves source, local UI and history unchanged and retains Redo,
observation tokens and any open typing continuation. Stale/foreign observations, read-only
policy, reused identities, resource exhaustion and late admission failures reject
without partial marker deletion. Selective shared Undo preserves peer characters;
the existing causal placement limitations still apply after concurrent
deletion/Undo/Redo.

## Remaining functionality and qualification

Continue existing-list task conversion, adjacent/nested automatic list behavior,
conventional code-fence Enter and the additional shortcut cases above without
flattening rich bodies or changing saved recipe meanings. Final input, browser,
performance, storage, compatibility and release qualification remain part of the
V1 goal. Synthetic composition and DOM tests do not qualify an OS input method,
native clipboard, screen reader or the historical intermittent WebKit fault.
