# Native input rules

Breditor input rules recognize bounded typed shortcuts and prepare ordinary native
edits. They are an explicit behavior policy, not a Markdown parser, document
format, operation protocol or replacement for semantic toolbar commands.

The Rust planner, local/shared application methods and optional Wasm/SDK calls
implement the first native policy. Browser opt-in, installed acceptance and
additional shortcut behavior remain work before this becomes an integrated V1 feature.
Existing typing, paste, composition, programmatic commands and recovery do not
enable it implicitly.

The [exclusive typing and SDK checkpoint](qualification/2026-10-18-exclusive-input-rules-sdk.json)
passes 19 selected checks, including full native regressions, strict lint/docs,
actual rebuilt Wasm, optional SDK types and search regressions. The current
programmatic calls restore 84 checkpoints in independently pinned earlier Wasm
readers and match 336 subsequent Undo/Redo checkpoints. Browser auto-routing and
installed acceptance remain separate work.

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

Browser auto-routing remains a separate implementation step. It must opt in
explicitly, use the same command coordinator and remote holds, and invoke the
exclusive call only for plain local `beforeinput insertText` at the admitted
caret. Paste, autocorrection/replacement, remote updates, composition,
grid/node/document replacement and different browser target ranges must keep
their ordinary paths. Native/SDK exposure alone does not enable shortcuts in
vanilla or React editors.

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

## Integration still required

Complete the optional Wasm and SDK capability, explicit vanilla/React startup
selection, composition/queue/remote boundaries and independent installed
workflow tests. Continue the additional shortcut cases above without changing
existing saved recipe meanings. Final input, browser, performance, storage,
compatibility and release qualification remain part of the V1 goal.
