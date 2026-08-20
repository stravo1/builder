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

import useBuilderStore from "@/stores/builderStore";
import { dataMethods } from "./data";
import { editorMethods } from "./editor";
import { bridge } from "./host/bridge";
import { hostMethods } from "./host/hostMethods";
import { surfaceMethods } from "./surfaces";

// the store resolves on each call, never at import, so nothing here depends on
// the order the editor loads in
bridge.define(
	{ ...hostMethods, ...surfaceMethods, ...editorMethods, ...dataMethods },
	{ isReadOnly: () => useBuilderStore().readOnlyMode },
);

export const {
	connect: connectExtension,
	disconnect: disconnectExtension,
	getEntryChannel,
	dispatcherFor,
	onTeardown,
	teardown: teardownExtension,
} = bridge;
