/** Initial policy is explicit, Boolean, raw-owner-only and not inferred from saved roles. */
import {initializeSharedReadOnly,type SharedRustOwner,type SharedRichEditor} from "@breditor/collaboration";
declare const raw:SharedRustOwner&{retained:"caller-owned"},core:SharedRichEditor;
const same:typeof raw=initializeSharedReadOnly(raw,true);
initializeSharedReadOnly(raw,false);
// @ts-expect-error No mode is inferred from checkpoints or native metadata.
initializeSharedReadOnly(raw);
// @ts-expect-error Modes are not strings or saved roles.
initializeSharedReadOnly(raw,"read_only");
// @ts-expect-error Already adopted owners have only the original guarded live setter.
initializeSharedReadOnly(core,true);
// @ts-expect-error Initial policy is not a counter-free live SDK mutator.
core.initializeReadOnly(true);
void same;
