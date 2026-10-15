import {createElement,createRef} from "react";
import {BreditorEditor,type BreditorEditorHandle} from "@breditor/editor/react";
import {createSharedProfile,type SharedProfileConfiguration} from "@breditor/editor/collaboration";
const handle=createRef<BreditorEditorHandle>();createElement(BreditorEditor,{ref:handle,sessionKey:"doc",initialOptions:{initial:{kind:"empty"}},onReady:editor=>editor.focus()});
const configuration:SharedProfileConfiguration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/typed",version:1},extensions:[]};void createSharedProfile(configuration);
void handle.current?.checkpointJson();
