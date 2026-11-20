/**
 * English byte identity for every catalog-wired panel. The pinned files were recorded from the panels before
 * they read the catalog; the default (no catalog) and an explicit empty catalog must still reproduce them
 * byte for byte, markup and text alike.
 */
import {afterEach,describe,expect,it} from "vitest";
import {resolveRichUi} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import {searchScenario,writingScenario,fullscreenScenario,reviewScenario,suggestionScenario} from "./ui_locale_panel_fixtures.js";
afterEach(()=>{document.body.replaceChildren();});
const scenarios={search:searchScenario,writing:writingScenario,fullscreen:fullscreenScenario,review:reviewScenario,suggestion:suggestionScenario};
describe("English panel output is byte-identical to the pre-catalog panels",()=>{
 for(const [name,scenario] of Object.entries(scenarios)){
  it(`${name} with no catalog`,async()=>{await expect(JSON.stringify(await scenario(),null,1)+"\n").toMatchFileSnapshot(`./__baseline__/ui_locale_${name}.en.json`);});
  it(`${name} with an explicit English catalog`,async()=>{await expect(JSON.stringify(await scenario(resolveRichUi({})),null,1)+"\n").toMatchFileSnapshot(`./__baseline__/ui_locale_${name}.en.json`);});
 }
});
