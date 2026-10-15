import {openSharedEditor,type SharedEditorSession,type SharedEditorSessionOptions} from "@breditor/editor/collaboration";
const options:SharedEditorSessionOptions={host:document.createElement("main"),database:"typed",room:"room",writer:"101"};
const opening:Promise<SharedEditorSession>=openSharedEditor(options);
void opening;
