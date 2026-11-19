/** Shared collaboration stays on rich languages 1–3. The unreleased candidate V4 is local-only and
 * is rejected explicitly; it never falls back to V3 or any other shared language. */
export function checkSharedRichLanguage(value:unknown):asserts value is 1|2|3|undefined{
 if(value===4)throw new TypeError("richLanguage 4 is the unreleased local-only candidate; shared editing supports richLanguage 1, 2 or 3");
 if(value!==undefined&&value!==1&&value!==2&&value!==3)throw new TypeError("Expected richLanguage 1, 2 or 3");
}
