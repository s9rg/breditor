import {SharedRoomReplay,type SharedRoomReplayOptions,type SharedRoomReplayEntry,type SharedRichEditor} from "@breditor/collaboration";
declare const options:SharedRoomReplayOptions,current:SharedRichEditor<"document-v1">;
const opened:Promise<SharedRoomReplay>=SharedRoomReplay.read(options);
// @ts-expect-error Detached progress is not a genuinely admitted catalog archive.
SharedRoomReplay.read({...options,archive:{verified:true}});
// @ts-expect-error All original native factories remain explicit inputs, not incoming metadata.
SharedRoomReplay.read({...options,participants:[{id:"historic-copy"}]});
// @ts-expect-error A saved readiness flag cannot construct an all-copy native replay.
new SharedRoomReplay();
async function consume(){const room=await opened,entries:readonly SharedRoomReplayEntry[]=room.entries();room.verifyNativeContinuation("historic-copy",current);
 // @ts-expect-error The complete borrowed source set is immutable.
 entries.push(entries[0]!);
 // @ts-expect-error Source readers expose no editable/native owner.
 entries[0]!.core.type("not exposed");
 room.dispose();return entries;}
void[opened,consume];
