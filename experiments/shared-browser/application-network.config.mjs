// The identical installed assertions now use the promoted application package, without probes.
import {defineConfig} from "@playwright/test";
import base from "./installed-network.config.mjs";
export default defineConfig({...base,outputDir:"../../target/shared-application-browser-results",use:{...base.use,baseURL:"http://127.0.0.1:49785"},webServer:{...base.webServer,url:"http://127.0.0.1:49785/",env:{BREDITOR_SHARED_PORT:"49785",BREDITOR_SHARED_INSTALLED:"application"}}});
