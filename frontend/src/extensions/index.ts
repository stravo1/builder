/**
 * The one place the editor holds its live extensions.
 *
 * A module rather than a store: milestone 4 reaches this from registry code,
 * and a registry module must not import Vue SFC scope (1.5, rule 1). The
 * install list is a resource, and lives with the others in `@/data`.
 *
 * Composing the method table here, rather than inside the bridge, is what keeps
 * the bridge from ever learning what a surface is.
 */

import { createExtensionBridge } from "./host/extensionBridge";
import { PROTOCOL_VERSION } from "./types";

/** An extension ships on its own schedule, so it needs to know where it landed (1.10). */
const hostInfo = () => ({
	version: window.builder_version,
	protocol: PROTOCOL_VERSION,
});

/** Milestone 4 spreads its surface methods in beside this one. */
const bridge = createExtensionBridge({
	"host.info": { needs: null, run: hostInfo },
});

export const {
	connect: connectExtension,
	disconnect: disconnectExtension,
	entryChannel,
	dispatcherFor,
	onTeardown,
	teardown: teardownExtension,
} = bridge;
