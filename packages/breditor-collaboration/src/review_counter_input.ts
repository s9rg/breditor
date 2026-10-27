/** Keep invalid untyped values out of wasm-bindgen's string allocator.
 * The original native counter grammar and all valid string semantics stay native. */
import{SharedEditorError}from'./shared_editor_error.js';
export function reviewCounterInput(value:unknown):string{if(typeof value!=='string')throw new SharedEditorError('review_counter','Review event counters must be strings');return value;}
