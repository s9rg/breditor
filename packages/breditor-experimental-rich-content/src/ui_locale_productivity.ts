/**
 * Chrome strings of the opt-in formatting-productivity tools (docs/FORMATTING_PRODUCTIVITY.md): the
 * special-character picker and the format painter. Kept in a separate block so the original catalog keys
 * and their English defaults stay byte-identical. Toolbar control labels use the ordinary `controls`
 * catalog; character and category names use `RichUiOptions.specialCharacters`.
 */
export interface RichProductivityUiStrings {
 readonly specialCharactersSearch:string;readonly specialCharactersCategory:string;readonly specialCharactersAll:string;
 readonly specialCharactersGrid:string;readonly specialCharactersCountOne:string;readonly specialCharactersCount:string;
 readonly specialCharactersEmpty:string;readonly specialCharacterItem:string;
 readonly formatPainterCopied:string;readonly formatPainterSticky:string;readonly formatPainterApplied:string;
 readonly formatPainterCancelled:string;readonly formatPainterNothing:string;
}
/** English defaults of the formatting-productivity chrome. */
export const richProductivityUiStringsEn:Readonly<RichProductivityUiStrings>=Object.freeze({
 specialCharactersSearch:"Search characters",specialCharactersCategory:"Category",specialCharactersAll:"All categories",
 specialCharactersGrid:"Special characters",specialCharactersCountOne:"1 character",specialCharactersCount:"{count} characters",
 specialCharactersEmpty:"No matching characters",specialCharacterItem:"{name} ({code})",
 formatPainterCopied:"Formatting copied. Select text to apply it once; Escape cancels.",
 formatPainterSticky:"Formatting copied for repeated use. Select text to apply it; Escape or the button stops.",
 formatPainterApplied:"Formatting applied.",formatPainterCancelled:"Format painter off.",
 formatPainterNothing:"The selection already has this formatting.",
});
/** Placeholders each productivity template may use. */
export const richProductivityUiParameters:Readonly<Partial<Record<keyof RichProductivityUiStrings,readonly string[]>>>=Object.freeze({
 specialCharactersCount:["count"],specialCharacterItem:["name","code"],
});
