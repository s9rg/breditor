/** Test-only mixed accepted AST. V1 excludes the later structural block vocabulary. */
import {coverageSeed} from "./coverage-seed.mjs";
export function fullscreenSeed(binding,language){
 const value=JSON.parse(coverageSeed(binding));
 if(language===1)value.root.children=value.root.children.filter(node=>["breditor/paragraph","breditor/table","breditor/bullet-list"].includes(node.type));
 return JSON.stringify(value);
}
