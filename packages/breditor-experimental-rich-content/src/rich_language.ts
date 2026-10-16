/** Capability reuse only. This never selects a compiled grammar or accepts unknown future revisions. */
export function isStructuralRichLanguage(language:unknown):language is 2|3{return language===2||language===3;}
