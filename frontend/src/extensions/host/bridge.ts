/**
 * The one bridge the editor runs on.
 *
 * It lives here, apart from `index.ts`, so a surface can import `dispatcherFor`
 * to build a frame's props without importing the module that composes the
 * method table. The dependency then runs one way: index → surfaces → bridge.
 *
 * `index.ts` fills the table with `define`, and is the only caller that may.
 */

import { createExtensionBridge } from "./extensionBridge";

export const bridge = createExtensionBridge();
