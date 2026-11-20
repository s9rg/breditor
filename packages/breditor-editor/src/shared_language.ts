/** Shared collaboration supports the explicit rich languages 1–4. Language 4 is the frozen V4
 * grammar with its own causal model 14 and journal 15; nothing outside 1–4 is ever mapped to an
 * existing language. */
export function checkSharedRichLanguage(value:unknown):asserts value is 1|2|3|4|undefined{
 if(value!==undefined&&value!==1&&value!==2&&value!==3&&value!==4)throw new TypeError("Expected richLanguage 1, 2, 3 or 4");
}
