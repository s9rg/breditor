# Native-held revision delivery

Status: [source and independently installed qualification passed](qualification/2026-10-29-native-revision-delivery.json): 1,049 direct checks, 475 installed checks and strict source/installed contracts. All thirteen V1 gates remain open.

The private revision delivery factory borrows the actual original outbox and
the genuine parent suggestion delivery. Both use the parent's one queue loan,
exact original source, and current native recovery context. It does not acquire
another recovery reservation, construct a replacement outbox, recapture an
immutable revision, or grant ordinary editor/queue/outbox mutation.

The ordinary and native paths share one authenticated revision algorithm.
Existing server meanings, predecessor checks, revision receipts, conflicts and
child-publication rules remain unchanged. A revision child enters the original
base queue only after actual authenticated supersession commitment. Competing
revisions and final predecessor decisions keep the original losing draft and
explicit winning decision; they do not publish the losing child.

Original source, original queue and revision receipt persistence keep their
dependency order. Separate revision storage saves its source and queue first.
Compound sources retain their original atomic record driver. Actual committed
receipt bytes become durable facts before checking post-commit authority.
Receipt or child-cache failure retains the exact records for explicit local
retry. A lost response is resolved from the original server feed, with no
new revision submission or independent child-publication fallback.

Conflict discovery previously could report a settled losing revision while
its accepting predecessor was still missing from the original queue and native
owned Undo. Six real-server reproductions showed that gap. The shared ordinary
and native algorithm now retains the authenticated predecessor decision and
verified owned history before saving the dependent revision conflict. It waits
for missing effects and retries exact original records after storage failure.

Only the original outbox constructor supplies its private state and write
barrier. Execution uses a fresh constructor-registered author/observer
transport. Old transport callbacks stay dormant during native recovery.
Execution options allow reporting callbacks, never replacement source, queue,
transport, credentials, packet capture or automatic startup.

Staging, actual writes, SDK requests and lazy downloads retain tracked work.
Parent close synchronously stops its revision children and waits for their
actual work before releasing its queue loan. Child close retains the original
outbox and does not stop the borrowed document connection. Closing the native
context also stops that connection; cancelled token results cannot reopen it.
Closing never retries failed storage, discards a saved record, releases native
editing, or activates the room. A reentrant close during construction cannot
leave an unowned opening slot or silently release a pending write.

Connect and synchronization use explicit current authority. Server/source
hints resume wanted work without idle polling. Disconnect stops the selected
metadata lane; it keeps the borrowed connection and parent queue ownership.
Lazy proof downloads remain available while outgoing revision work is
disconnected, deduplicate concurrent requests and create no local draft.
Explicit local retry repairs the queue dependency before the outbox barrier.

Permanent observers retain their zero authored prefix, observer-only resume
and absence of Accept/document submissions. Document read-only policy keeps
independent comment history and its current permissions. Supersession itself
changes proposal state; later child acceptance still follows the original
server decision order and verified native owned/unowned Undo contract.

Functional coverage uses actual Rust servers and pinned normal Wasm with
controlled IndexedDB, locks and transport interruptions. It includes all six
bound source families, three selection policies, explicit/typing grouping,
owned/unowned child Accept, permanent observers, local receipt/queue failures,
post-commit authority loss, lost replies, competing revisions, lazy proofs and
parent/child retirement. Complete-room tests cover both successful supersession
and explicit final-decision conflicts, preserving exact packets and future
document/comment Undo/Redo after cold recovery for all seven source families.
Independent package archives run the same tests and ordinary regressions.

All thirteen V1 gates remain open. The three local source lanes still need
explicit current metadata bindings. Complete provider/client/historical-copy
and asset reconciliation, plus authenticated joint activation, remain required.
These functional checks do not qualify physical browser durability,
accessibility, performance, or the historical intermittent WebKit fault.
