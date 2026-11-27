# Crash recovery for the local editor

`crashRecovery` is an opt-in watchdog for the local SDK editors,
`openLocalEditor` and `openLocalDocumentEditor` in `@breditor/editor`. When the
native owner crashes, the watchdog freezes input. It then reopens a fresh owner
in the same host from the last exact checkpoint, after checking that the
checkpoint restores exactly. It never restarts from in-memory state that was not
read as a checkpoint, and it never loops: a restart budget ends in a frozen,
read-only failed state. Openings without the option behave as before and return
the same objects as before.

The shared (collaboration) editor has no watchdog yet; see
[Limitations](#limitations).

## Use

```ts
import {openLocalEditor, RichLocalSessionStore} from '@breditor/editor';
import {mountLocalAutosave} from '@breditor/editor/autosave';

const store = await RichLocalSessionStore.open('my-document');
const saved = await store.load();
let autosave;
const editor = await openLocalEditor({
  host,
  initial: saved ? {kind: 'checkpoint', checkpointJson: saved} : {kind: 'empty'},
  crashRecovery: {
    maxRestarts: 3,      // default 3, integer 0..100
    windowMs: 60_000,    // default 60000
    onCrash(diagnostic) { report(diagnostic); },
    onRestarted(diagnostic) {
      // Ports borrowed from the old owner are closed: mount them again.
      autosave.dispose();
      autosave = mountLocalAutosave(editor, store);
    },
    onFailed(diagnostic) {
      // The error event. The editor stays frozen; offer a reload.
      void store.save(editor.verifiedCheckpointJson());
    },
  },
});
autosave = mountLocalAutosave(editor, store);
```

With `crashRecovery`, the openings return a `RecoverableLocalEditor` or a
`RecoverableLocalDocumentEditor`. Each is the usual editor interface plus:

- `recovery()`: `{phase, restarts, editsSinceCheckpoint, checkpoint}`. `phase`
  is `running`, `restarting`, `failed` or `disposed`. `editsSinceCheckpoint`
  counts the content-changing outcomes (`content`, `typing`, `undo`, `redo`)
  published since the kept checkpoint. A crash now would lose that many edits.
- `verifiedCheckpointJson()`: the kept checkpoint. You can read it in every
  phase, including `failed`, so the last good state is never thrown away.

The editor object stays the same across restarts, and every call goes to the
current owner. `surface`, `toolbar` and `status` return the current owner's
elements, so after a restart they are new elements in the same host. Ports
borrowed from the old owner are closed after a restart: `search()`,
`writing()`, `fullscreen()`, `contextUi()`, `source()`, and the panels and
autosave mounted on them. Mount them again in `onRestarted`. Toolbar and
clipboard-interchange factories run again for the new owner, because they are
per-owner factories.

## What counts as a crash

Only failures that leave the native owner unusable restart it:

| Reason | Detected from |
| --- | --- |
| `wasm-trap` | A `WebAssembly.RuntimeError`. Rust panics abort in the shipped Wasm profile and surface as traps, such as `unreachable`. |
| `poisoned-owner` | wasm-bindgen errors for a Rust object whose borrow or ownership was cut short by an aborted call, such as "recursive use of an object detected" or "null pointer passed to rust". |
| `invariant` | The SDK's own boundary check (`RichCommandError` code `breditor_rich.boundary`), raised when a native result is absent or malformed. |

The watchdog checks two paths:

- Every call on the editor object (`source: "api"`). The original error is still
  thrown to the caller.
- The editor's own command and input path (`source: "input"`). These are the
  errors the DOM coordinator reports through `onError`. The host's `onError` is
  called first.

Ordinary refusals never restart the owner. Examples are stale revisions,
read-only or restricted policy, unsupported capabilities, missing asset hosts,
and `TypeError` validation.

## Restart sequence

1. **Freeze.** The host gets `inert`, `aria-busy="true"` and
   `data-breditor-recovery="restarting"`. Editor calls throw
   `CrashRecoveryError` with code `restarting`. `onCrash` is called.
2. **Budget.** At most `maxRestarts` restarts may start in any sliding window of
   `windowMs`. When the budget is used up, the editor goes to the failed state
   (`failure: "budget"`). `maxRestarts: 0` fails on the first crash.
3. **Verify.** The watchdog leaves the failing call stack first. It then
   restores the kept checkpoint in a fresh headless owner of the same profile,
   using the same checkpoint family (explicit or natural typing history, and
   original or document scope). The fresh owner must re-export the checkpoint
   byte for byte. If the restore throws (for example on a second trap), or the
   re-export differs, no restart happens (`failure: "verification"`). The broken
   owner is not disposed and stays on screen, frozen.
4. **Dispose the broken owner.** Its DOM is released before the native object is
   freed, so a failing free cannot block the restart. That error is swallowed.
5. **Reopen.** The fresh owner opens in the same host from the kept checkpoint,
   with the original options. Undo/Redo history comes back because the
   checkpoint holds it. The live read-only and restricted-editing policies and
   the placeholder label are applied again, because restored owners start
   editable. If the reopen fails, or a policy cannot be applied again, the
   editor goes to the failed state (`failure: "reopen"`). The fresh opening's
   rollback leaves the host empty.
6. **Restore focus and selection, cheaply.** The checkpoint carries its own
   selection. If a later text, node or grid selection was published, the
   watchdog tries to apply it again and keeps the checkpoint's selection if
   that fails. If focus was inside the host when the crash happened, the new
   surface gets focus.
7. **Resume.** The freeze attributes are removed and `onRestarted` is called.

### Failed state

`phase` is `failed`, `onFailed` is called, and the host keeps `inert` with
`data-breditor-recovery="failed"`. Calls throw `CrashRecoveryError` with code
`failed`, and no further restart is attempted, even after the window passes.
`verifiedCheckpointJson()` still returns the kept checkpoint. `dispose()`
releases everything and does not throw for a crashed owner.

### Dispose during a restart

`dispose()` at any point cancels the pending restart. During verification, the
broken owner is disposed and nothing reopens. During the reopen, the opening's
abort signal fires and its rollback runs. No `restarted` or `failed` event is
emitted after `dispose()`, and the freeze attributes are removed. Disposing from
inside `onCrash` also stops recovery.

## Which checkpoint is kept

The kept checkpoint is the last result of one of these reads:

- the checkpoint read right after opening (`checkpoint: "initial"`), or
- any later successful `editor.checkpointJson()` call (`checkpoint: "exact"`).
  This includes the reads that `mountLocalAutosave` makes before each durable
  save.

The watchdog never reads the crashed owner. Autosave writes only checkpoints it
has read, so the durable copy is never newer than the kept checkpoint, and a
restart never goes back past durable data. To lose fewer edits, attach autosave,
or read `checkpointJson()` at points that matter to your application.

## Diagnostics

Diagnostics carry no content. They hold no error message, document text, IDs or
checkpoint:

```ts
{
  format: 'breditor/crash-diagnostic', formatVersion: 1,
  reason: 'wasm-trap' | 'poisoned-owner' | 'invariant',
  errorName: 'RuntimeError',       // the thrown value's name only
  source: 'api' | 'input',
  restartsInWindow: 0,             // restarts already used in the window
  editsLost: 2,                    // edits after the kept checkpoint
  checkpoint: 'initial' | 'exact',
  // onRestarted adds `restarts`; onFailed adds
  // `failure: 'budget' | 'verification' | 'reopen'`.
}
```

The watchdog catches and ignores exceptions thrown by listeners.

## Limitations

- **One Wasm instance per page.** The generated glue initializes the module once
  per page, so a restart reuses the same instance and its linear memory. A trap
  that corrupted memory outside the crashed owner usually makes the verification
  restore fail or trap. That ends in the failed state, not in a loop. Resetting
  the instance fully still needs a page reload. Reload with
  `verifiedCheckpointJson()` or the durable store.
- **Shared editors are not covered.** A shared owner's state is the room's state.
  Restarting it from a local checkpoint would need the relay's reconciliation
  and outbox recovery, which the shared SDK already handles on reconnect. A
  watchdog for `openSharedEditor` is follow-up work.
- **React.** The React components do not pass `crashRecovery` through yet. Use
  the imperative openings.
- **Edits since the kept checkpoint are lost.** `editsLost` and
  `editsSinceCheckpoint` count them; there is no replay of unverified edits.
- **Browser coverage.** The jsdom suite
  (`packages/breditor-editor/tests/crash_recovery.test.ts`) injects faults
  through a test-only fake owner. There is no installed-consumer Playwright spec
  yet: building that consumer needs the full package and relay pipeline.
