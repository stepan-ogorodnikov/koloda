import rootConfig from "../../lingui.config";

// WHY: the root catalog paths are relative to the app directory, which becomes rootDir when
// this file is the loaded config. The vite plugin needs them to compile the `.po` imports.
export default rootConfig;
