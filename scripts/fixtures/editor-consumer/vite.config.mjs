import {resolve} from "node:path";
export default {build:{target:"es2022",modulePreload:{polyfill:false},rollupOptions:{input:{local:resolve("index.html"),react:resolve("react.html"),shared:resolve("shared.html"),startup:resolve("startup.html"),sharedSession:resolve("shared-session.html"),sharedReact:resolve("shared-react.html")}}}};
