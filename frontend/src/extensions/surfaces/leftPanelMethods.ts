/**
 * One left panel tab per extension (1.10), rendered as a frame (Tier C).
 *
 * The registry receives the same object shape a built-in tab produces, so
 * `BuilderLeftPanel.vue` needs no line that knows extensions exist (B6).
 */

import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { leftPanelTabs, type LeftPanelTab } from "@/components/LeftPanelTabs";
import { editorContext } from "../editor/editorContext";
import { assertRule, matches, type ShowWhenRule } from "../editor/showWhen";
import { bridge } from "../host/bridge";
import type { MethodTable } from "../host/capabilities";
import type { PortChannel } from "../transport/createPortChannel";
import { fields, flag, optionalText, text } from "./params";
import { createSurfaceItems, type SurfaceItem } from "./surfaceItems";

type Registration = {
	name: string;
	label: string;
	icon: string;
	before?: string;
	after?: string;
	showWhen?: ShowWhenRule;
	visible: boolean;
};

const read = (params: unknown): Registration => {
	const sent = fields(params);
	assertRule(sent.showWhen as ShowWhenRule | undefined);

	return {
		name: text(sent.name, "name"),
		label: text(sent.label, "label"),
		icon: text(sent.icon, "icon"),
		before: optionalText(sent.before, "before"),
		after: optionalText(sent.after, "after"),
		showWhen: sent.showWhen as ShowWhenRule | undefined,
		visible: true,
	};
};

const merge = (current: Registration, patch: Record<string, unknown>): Registration => ({
	...current,
	label: optionalText(patch.label, "label") ?? current.label,
	icon: optionalText(patch.icon, "icon") ?? current.icon,
	visible: flag(patch.visible, current.visible),
});

const describe = (key: string, { extension, registration }: SurfaceItem<Registration>): LeftPanelTab => {
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

const tabs = createSurfaceItems<Registration, LeftPanelTab>({
	kind: "left panel tab",
	registry: leftPanelTabs,
	oneEach: true,
	read,
	merge,
	describe,
});

export const leftPanelMethods: MethodTable = {
	// the host draws the tab strip and mounts the frame, so no capability gates this
	"leftPanel.register": { needs: null, run: tabs.add },
	"leftPanel.unregister": { needs: null, run: tabs.drop },
	"leftPanel.update": { needs: null, run: tabs.patch },
};
