/**
 * The one place the editor holds its live extensions.
 *
 * A module rather than a store: registry code reaches this, and a registry
 * module must not import Vue SFC scope (1.5, rule 1). The install list is a
 * resource, and lives with the others in `@/data`.
 *
 * The bridge itself lives in `host/bridge.ts`, so a surface can import it
 * without importing this file back. This file composes the method table, which
 * is what keeps the bridge from ever learning what a surface is.
 */

import { bridge } from "./host/bridge";
import { hostMethods } from "./host/hostMethods";
import { surfaceMethods } from "./surfaces";

bridge.define({ ...hostMethods, ...surfaceMethods });

export const {
	connect: connectExtension,
	disconnect: disconnectExtension,
	entryChannel,
	dispatcherFor,
	onTeardown,
	teardown: teardownExtension,
} = bridge;
