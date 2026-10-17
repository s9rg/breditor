import {id,selectedTable} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionComposerAction} from "../types.js";
import {commands} from "./shared.js";
/** Propose one appended column. Native schema, size and structural limits still admit the result. */
export const tableColumnSuggestion:SharedSuggestionComposerAction={id:"table-column",label:"Append table column",fields:[{id:"width",label:"Column width",initial:"120"}],enabled:c=>!!selectedTable(c.model),draft(c){const table=selectedTable(c.model),width=Number(c.values["width"]);if(!table||!Number.isSafeInteger(width)||width<=0)throw Error("Select a table and a positive whole column width");return commands([{kind:"insert_column",data:{block:id(table),column:c.allocate("column"),width,before:null}}]);}};
