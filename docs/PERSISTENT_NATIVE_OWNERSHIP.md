# Persistent native ownership

A persistent session owns the native editor acquired by its genuine constructor.
Its public `core` property is a convenient application handle, not a transferable
ownership slot. This applies to original document/search sessions, atomic paired
review sessions and generation-aware sessions.

## Reproduced failure and repair

Before repair, changing the public property to another genuine editor could
redirect `save()` to that editor. Its checkpoint could pass the same room/writer
checks while containing different native input. Closing the session could then
dispose that replacement and leave the actual owned editor alive. A TypeScript
`readonly` declaration did not prevent this at JavaScript runtime. Equal text or
matching declared identities could not establish the original native custody.

Each session now retains its constructor-acquired editor in a private, immutable
reference. Capture, backup, native relay-progress checks, version admission and
generation actions require the original own data-property binding. They inspect
the descriptor without invoking an application-supplied replacement getter.
Internal cleanup always retires/disposes the privately owned editor. It never
adopts or destroys a replacement supplied through the public property.

## Failure and retry contract

A missing, accessor or different-editor binding refuses new capture before it
can replace the pending native cut or change the durable head. Previously
captured genuine attempts may still complete; binding refusal does not delete
them, clear history, roll back a committed transaction or manufacture an
acknowledgement.

Ordinary close retires the actual editor first. If final capture or persistence
fails, the exact readable histories and writer leases remain available for
retry. Restoring the original binding does not unretire editing. Explicit
`discardAndClose()` still abandons unsaved memory, releases its actual owned
editor, waits for outstanding storage work and releases its leases. It leaves
the last committed record and all immutable generation files intact. A foreign
editor remains its caller's responsibility.

No native checkpoint, event frame, stored role, writer counter, history policy,
database family or original admission bound changes. Backup/transport custody
checks and current host authorization remain separately required. This contract
does not turn a shared JavaScript realm into a boundary against arbitrary host
code replacing globals, prototypes or the native owner's methods.

## Regression coverage

The source and fresh-installed probes use actual normal native Wasm owners with
explicit synthetic IndexedDB/Web Locks. Across the three session classes they
cover all three native grammar versions, plain/standard profiles, original,
general and document selection scopes, explicit/natural history, search,
paired comments, versions and saved Redo. Value replacement, deletion and
replacement getters must refuse capture; getters must never run. Failed final
close retains the original native files and leases. Failed save plus retry,
cold reopen and explicit discard preserve the same ownership distinction.

The probes are functional storage tests, not physical crash-durability,
cross-device fencing, browser/accessibility or whole-room activation approval.
The [functional qualification](qualification/2026-10-21-managed-core-binding.json)
records the actual failing old SDK, the repaired source and fresh installed
matrices, and unchanged native build inputs and public persistence declarations.
