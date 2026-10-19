/** Read-only continuity consumes genuine SDK owners, never detached journal/readiness DTOs. */
import type {SharedRichEditor,SharedRustOwner} from "@breditor/collaboration";
declare const core:SharedRichEditor,document:SharedRichEditor<"document-v1">,raw:SharedRustOwner;
const available:boolean=core.supportsRecoveryOrigin();
const nothing:void=core.verifyRecoveryOrigin(core);
core.verifyRecoveryOrigin(document); // Different native modes still reject dynamically.
// @ts-expect-error Native raw owners are not adopted SDK owners.
core.verifyRecoveryOrigin(raw);
// @ts-expect-error Serialized journals cannot manufacture a native origin.
core.verifyRecoveryOrigin({checkpointJson:"journal",ready:true});
// @ts-expect-error Continuity has no caller-supplied observation or writable grant argument.
core.verifyRecoveryOrigin(core,{ready:true});
// @ts-expect-error Continuity is a synchronous pure check, not an activation result.
const grant:boolean=core.verifyRecoveryOrigin(core);
void [available,nothing,grant];
