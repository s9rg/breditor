import {id,selectedImage} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands} from "./shared.js";
import {richUiError} from "@breditor/experimental-rich-content/rendering";
/** Propose literal alt text without replacing an asset, interpreting HTML or uploading bytes. */
export const imageAltSuggestion:SharedSuggestionComposerAction={id:"image-alt",label:"Change image description",fields:[{id:"text",label:"Image description"}],enabled:c=>!!selectedImage(c.model),draft(c){const image=selectedImage(c.model);if(!image)throw richUiError("suggestErrorImage");return commands([{kind:"set_image_alt",data:{block:id(image),text:c.values["text"]??"",decorative:false}}]);}};
