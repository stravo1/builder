/**
 * The bookkeeping every surface repeats: which extension registered what, under
 * which key, and how to take it back.
 *
 * A surface keeps only what is its own — how to read a registration, how to
 * merge a patch, and what descriptor the registry receives.
 *
 * `update` merges and registers again. A registry item is a copy
 * (`createRegistry.ts:65`), so a value held anywhere else never reaches the
 * screen, and re-registering keeps the item's slot (1.5, rule 4).
 */

import type { RegistryEntry, createRegistry } from "@/utils/createRegistry";
import { bridge } from "../host/bridge";
import type { InstalledExtension } from "../types";
import { fields, refuse, text } from "./params";

type Named = { name: string };

export type SurfaceItem<TRegistration> = {
	extension: InstalledExtension;
	registration: TRegistration;
};

type Options<TRegistration extends Named, TItem extends RegistryEntry> = {
	/** Names the surface in a refusal, such as "left panel tab". */
	kind: string;
	registry: ReturnType<typeof createRegistry<TItem>>;
	read: (params: unknown, extension: InstalledExtension) => TRegistration;
	merge: (
		current: TRegistration,
		patch: Record<string, unknown>,
		extension: InstalledExtension,
	) => TRegistration;
	describe: (key: string, item: SurfaceItem<TRegistration>) => TItem;
	/** One per extension, as 1.10 requires of leftPanel and settings. */
	oneEach?: boolean;
};

export const createSurfaceItems = <TRegistration extends Named, TItem extends RegistryEntry>(
	options: Options<TRegistration, TItem>,
) => {
	const items = new Map<string, SurfaceItem<TRegistration> & { unregister: () => void }>();

	// the host composes every registry name: two extensions may pick the same one
	const keyOf = (extension: InstalledExtension, name: string) => `${extension.name}:${name}`;

	const keyFrom = (params: unknown, extension: InstalledExtension) =>
		keyOf(extension, text(fields(params).name, "name"));

	const held = (key: string) => {
		const item = items.get(key);
		if (!item) throw refuse(`No ${options.kind} is registered under "${key}".`, "unknown_item");
		return item;
	};

	const mount = (key: string, item: SurfaceItem<TRegistration>) => {
		const unregister = options.registry.register(options.describe(key, item));
		items.set(key, { ...item, unregister });
	};

	const remove = (key: string) => {
		items.get(key)?.unregister();
		items.delete(key);
	};

	const add = (params: unknown, extension: InstalledExtension) => {
		const registration = options.read(params, extension);
		const owned = [...items.values()].some((item) => item.extension.name === extension.name);
		if (options.oneEach && owned) {
			throw refuse(`"${extension.name}" already registers a ${options.kind}.`, "already_registered");
		}

		const key = keyOf(extension, registration.name);
		// a re-registration replaces the item, so its teardown must not be added twice
		if (!items.has(key)) bridge.onTeardown(extension.name, () => remove(key));
		mount(key, { extension, registration });
	};

	const patch = (params: unknown, extension: InstalledExtension) => {
		const key = keyFrom(params, extension);
		const item = held(key);
		mount(key, {
			extension: item.extension,
			registration: options.merge(item.registration, fields(fields(params).patch), extension),
		});
	};

	const drop = (params: unknown, extension: InstalledExtension) => {
		const key = keyFrom(params, extension);
		held(key);
		remove(key);
	};

	return { add, patch, drop };
};
