/**
 * The one place the editor holds its live extensions.
 *
 * A module rather than a store: milestone 4 reaches this from registry code,
 * and a registry module must not import Vue SFC scope (1.5, rule 1). The
 * install list is a resource, and lives with the others in `@/data`.
 */

import { unknownMethod, type PortChannel } from "./transport/createPortChannel";
import { PROTOCOL_VERSION } from "./types";

/** The hidden entry frame's channel, per extension (B2). */
const entryChannels = new Map<string, PortChannel>();

/**
 * The first frame of an extension to connect is always its entry frame, because
 * no UI frame can exist before `main.js` has registered anything (B2).
 */
export const connectExtension = (extension: string, channel: PortChannel) => {
	if (!entryChannels.has(extension)) entryChannels.set(extension, channel);
};

/** Identity, not name: a reconnecting frame must not delete its own replacement. */
export const disconnectExtension = (extension: string, channel: PortChannel) => {
	if (entryChannels.get(extension) === channel) entryChannels.delete(extension);
};

export const entryChannel = (extension: string) => entryChannels.get(extension);

/** An extension ships on its own schedule, so it needs to know where it landed (1.10). */
const hostInfo = () => ({
	version: window.builder_version,
	protocol: PROTOCOL_VERSION,
});

/**
 * Answers what a frame calls. Milestone 3 replaces the body with the method
 * table, and puts the capability check in front of it.
 */
export const dispatch = (method: string, params: unknown) => {
	if (method === "host.info") return hostInfo();
	throw unknownMethod(method);
};
