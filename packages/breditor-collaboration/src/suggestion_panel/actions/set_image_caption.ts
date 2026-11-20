import {id,selectedImage} from "@breditor/experimental-rich-content/rendering";
import {paragraph} from "../../actions.js";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands} from "./shared.js";
import {richUiError} from "@breditor/experimental-rich-content/rendering";
/** Propose a single fresh caption paragraph. Rust admits its structure; assets remain host-owned. */
export const imageCaptionSuggestion:SharedSuggestionComposerAction={id:"image-caption",label:"Change image caption",fields:[{id:"text",label:"Image caption"}],enabled:c=>!!selectedImage(c.model),draft(c){const image=selectedImage(c.model);if(!image)throw richUiError("suggestErrorImage");return commands([{kind:"set_image_caption",data:{block:id(image),caption:paragraph(c.allocate("caption"),c.values["text"]??"")}}]);}};
