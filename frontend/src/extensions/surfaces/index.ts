/**
 * Every method a surface answers, in one table.
 *
 * Each surface file owns its registry and its own state. This file only
 * gathers them, so adding a surface is one import and one spread.
 */

import type { MethodTable } from "../host/capabilities";
import { leftPanelMethods } from "./leftPanelMethods";

export const surfaceMethods: MethodTable = {
	...leftPanelMethods,
};
