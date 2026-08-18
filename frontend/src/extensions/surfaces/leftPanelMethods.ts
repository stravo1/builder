/**
 * One left panel tab per extension (1.10), rendered as a frame (Tier C).
 *
 * The registry receives the same object shape a built-in tab produces, so
 * `BuilderLeftPanel.vue` needs no line that knows extensions exist (B6).
 *
 * `update` merges its patch and registers again. A registry item is a copy
 * (`createRegistry.ts:65`), so a value the bridge holds elsewhere could never
 * reach the screen, and re-registering keeps the item's slot (1.5, rule 4).
 */

import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { leftPanelTabs, type LeftPanelTab } from "@/components/LeftPanelTabs";
import { editorContext } from "../editor/editorContext";
import { assertRule, matches, type ShowWhenRule } from "../editor/showWhen";
import { bridge } from "../host/bridge";
import type { MethodTable } from "../host/capabilities";
import { ChannelCallError, type PortChannel } from "../transport/createPortChannel";
import type { InstalledExtension } from "../types";

type Registration = {
	name: string;
	label: string;
	icon: string;
	before?: string;
	after?: string;
	showWhen?: ShowWhenRule;
	visible: boolean;
};

type Tab = {
	extension: InstalledExtension;
	registration: Registration;
	/** Replaced on every re-registration, so only the live one is ever called. */
	undo: () => void;
};

const tabs = new Map<string, Tab>();

/** The host composes every registry name. Two extensions may both call a tab "icons". */
const keyOf = (extension: InstalledExtension, name: string) => `${extension.name}:${name}`;

const refuse = (message: string, code: string) => new ChannelCallError({ message, code });

const text = (value: unknown, field: string) => {
	if (typeof value !== "string" || !value.trim()) {
		throw refuse(`"${field}" must be a non-empty string.`, "invalid_params");
	}
	return value;
};

const optionalText = (value: unknown, field: string) =>
	value === undefined ? undefined : text(value, field);

const readRegistration = (params: unknown): Registration => {
	const fields = (params ?? {}) as Record<string, unknown>;
	assertRule(fields.showWhen as ShowWhenRule | undefined);

	return {
		name: text(fields.name, "name"),
		label: text(fields.label, "label"),
		icon: text(fields.icon, "icon"),
		before: optionalText(fields.before, "before"),
		after: optionalText(fields.after, "after"),
		showWhen: fields.showWhen as ShowWhenRule | undefined,
		visible: true,
	};
};

const descriptor = (key: string, tab: Tab): LeftPanelTab => {
	const { extension, registration } = tab;
	// built once per registration: ExtensionFrame reads it at load, and a fresh
	// identity on every render would be work for nothing
	const dispatch = bridge.dispatcherFor(extension);

	return {
		name: key,
		label: registration.label,
		icon: registration.icon,
		before: registration.before,
		after: registration.after,
		// 1.13: mount on first open, and v-show keeps the document alive after that
		lazy: true,
		component: ExtensionFrame,
		props: () => ({
			extension: extension.name,
			slot: "panel",
			entry: extension.entry,
			dispatch,
			onConnect: (channel: PortChannel) => bridge.connect(extension.name, channel),
			onDisconnect: (channel: PortChannel) => bridge.disconnect(extension.name, channel),
		}),
		condition: () => matches(registration.showWhen, editorContext.value) && registration.visible,
	};
};

const mount = (key: string, tab: Tab) => {
	tab.undo = leftPanelTabs.register(descriptor(key, tab));
	tabs.set(key, tab);
};

const owned = (extension: InstalledExtension) =>
	[...tabs.entries()].find(([, tab]) => tab.extension.name === extension.name);

const held = (key: string) => {
	const tab = tabs.get(key);
	if (!tab) throw refuse(`No left panel tab is registered under "${key}".`, "unknown_item");
	return tab;
};

const register = (params: unknown, extension: InstalledExtension) => {
	const registration = readRegistration(params);
	if (owned(extension)) {
		throw refuse(`"${extension.name}" already registers a left panel tab.`, "already_registered");
	}

	const key = keyOf(extension, registration.name);
	mount(key, { extension, registration, undo: () => {} });
	bridge.onTeardown(extension.name, () => remove(key));
};

const remove = (key: string) => {
	tabs.get(key)?.undo();
	tabs.delete(key);
};

const unregister = (params: unknown, extension: InstalledExtension) => {
	const key = keyOf(extension, text((params as { name?: unknown })?.name, "name"));
	held(key);
	remove(key);
};

const update = (params: unknown, extension: InstalledExtension) => {
	const { name, patch } = (params ?? {}) as { name?: unknown; patch?: Record<string, unknown> };
	const key = keyOf(extension, text(name, "name"));
	const tab = held(key);

	tab.registration = {
		...tab.registration,
		label: optionalText(patch?.label, "label") ?? tab.registration.label,
		icon: optionalText(patch?.icon, "icon") ?? tab.registration.icon,
		visible: typeof patch?.visible === "boolean" ? patch.visible : tab.registration.visible,
	};
	mount(key, tab);
};

export const leftPanelMethods: MethodTable = {
	// the host draws the tab strip and mounts the frame, so no capability gates this
	"leftPanel.register": { needs: null, run: register },
	"leftPanel.unregister": { needs: null, run: unregister },
	"leftPanel.update": { needs: null, run: update },
};
