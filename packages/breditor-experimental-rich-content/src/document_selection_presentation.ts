/** Whole-document selection also marks non-text atoms and hidden placeholders as one scope. */
export const documentSelectionStyles=`[data-breditor-rich] .breditor-rich-surface[data-document-selected]{outline:3px solid #398a79;outline-offset:-3px}[data-breditor-rich] .breditor-rich-surface[data-document-selected]>:is(hr,figure,table,[data-select-node]){box-shadow:inset 0 0 0 2px #398a79}`;
