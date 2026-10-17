import {id,selectedTable} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands} from "./shared.js";
/** Propose one appended row through the original native structural command and fresh host IDs. */
export const tableRowSuggestion:SharedSuggestionComposerAction={id:"table-row",label:"Append table row",enabled:c=>!!selectedTable(c.model),draft(c){const table=selectedTable(c.model);if(!table)throw Error("Select a table or one of its cells first");return commands([{kind:"insert_row",data:{block:id(table),row_block:c.allocate("row-block"),row:c.allocate("row"),before:null}}]);}};
