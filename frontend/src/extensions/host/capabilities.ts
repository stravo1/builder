/**
 * The gate in front of every method a frame calls (1.12).
 *
 * Pure: the bridge holds the record and passes it in, so nothing here reads a
 * resource or keeps state. The capability keys live in `../types`, beside the
 * spelling the SDK reads.
 */

import { ChannelCallError } from "../transport/createPortChannel";
import type { Capability, InstalledExtension } from "../types";

/**
 * One method the host answers.
 *
 * `needs` is required rather than optional, so a method that needs no grant says
 * so out loud. A method cannot reach the table with its gate forgotten.
 */
export type HostMethod = {
	needs: Capability | null;
	/** The record comes from the dispatcher's closure, never from the wire (B2). */
	run: (params: unknown, extension: InstalledExtension) => unknown;
};

export type MethodTable = Record<string, HostMethod>;

/** The check a `bind` control makes at registration, where there is no call to gate (B3). */
export const canWrite = (extension: InstalledExtension) => extension.capabilities.includes("block.update");

export const assertGranted = (extension: InstalledExtension, method: string, needs: Capability | null) => {
	if (!needs || extension.capabilities.includes(needs)) return;
	throw new ChannelCallError({
		message: `"${extension.name}" was not granted ${needs}, which "${method}" needs.`,
		code: "capability_required",
	});
};
