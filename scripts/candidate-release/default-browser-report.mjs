import {validatePlaywrightCaseInventory} from "./playwright-case-inventory.mjs";

export function validateDefaultBrowserReport(discovered,report){
 const names=discovered.config?.projects?.map(project=>project.name)??[];
 const {count,projects}=validatePlaywrightCaseInventory(discovered,report,names);
 return {count,projects};
}
