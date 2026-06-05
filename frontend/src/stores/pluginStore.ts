import type { PluginBundle } from "@/plugins/api/types";
import { pluginRunner } from "@/plugins/runner/PluginRunner";
import { uiMessageBridge } from "@/plugins/bridge/UIMessageBridge";
import { defineStore } from "pinia";
import { confirmPluginSwitch } from "@/utils/pluginSwitchConfirm";
import { toast } from "frappe-ui";

const PINNED_KEY = "builder_pinned_plugins";

function loadPinned(): string[] {
	try {
		const raw = localStorage.getItem(PINNED_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function savePinned(ids: string[]) {
	localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
}

export function normalizePluginIcon(icon?: string | null): string {
	if (!icon) return "lucide-puzzle";
	if (icon.startsWith("lucide-")) return icon;
	return `lucide-${icon}`;
}

const usePluginStore = defineStore("pluginStore", {
	state: () => ({
		plugins: [] as PluginBundle[],
		activePlugin: null as PluginBundle | null,
		panelOpen: false,
		loading: false,
		error: null as string | null,
		uiHtml: null as string | null,
		_pluginsLoaded: false,
		pinnedPluginIds: loadPinned(),
	}),
	getters: {
		enabledPlugins(): PluginBundle[] {
			return this.plugins.filter((plugin) => plugin.enabled !== false);
		},
		pinnedPlugins(): PluginBundle[] {
			return this.enabledPlugins.filter((p) => this.pinnedPluginIds.includes(p.id));
		},
	},
	actions: {
		setPlugins(plugins: PluginBundle[]) {
			this.plugins = plugins;
			this._pluginsLoaded = true;
		},
		togglePinnedPlugin(pluginId: string) {
			const idx = this.pinnedPluginIds.indexOf(pluginId);
			if (idx === -1) {
				this.pinnedPluginIds.push(pluginId);
			} else {
				this.pinnedPluginIds.splice(idx, 1);
			}
			savePinned(this.pinnedPluginIds);
		},
		isPluginPinned(pluginId: string): boolean {
			return this.pinnedPluginIds.includes(pluginId);
		},
		async runPlugin(plugin: PluginBundle) {
			if (this.loading) return;

			if (this.activePlugin && this.activePlugin.id !== plugin.id) {
				const confirmed = await confirmPluginSwitch(
					this.activePlugin.name,
					plugin.name,
				);
				if (!confirmed) return;
				await this.closePlugin();
			}

			this.loading = true;
			this.error = null;
			this.activePlugin = plugin;
			this.panelOpen = true;
			this.uiHtml = plugin.uiHtml || defaultPluginUI(plugin);

			uiMessageBridge.setPluginId(plugin.id);
			uiMessageBridge.setHandler((message) => pluginRunner.handleUIMessage(message));

			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

			try {
				await pluginRunner.run(plugin, (payload) => {
					uiMessageBridge.postToUI("plugin-message", payload);
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.error = message;
				toast.error(`Plugin error: ${message}`);
			} finally {
				this.loading = false;
			}
		},
		async closePlugin() {
			await pluginRunner.close();
			this.activePlugin = null;
			this.panelOpen = false;
			this.uiHtml = null;
			this.error = null;
			uiMessageBridge.setPluginId(null);
			uiMessageBridge.setHandler(null);
		},
	},
});

function defaultPluginUI(plugin: PluginBundle) {
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body class="pui">
  <h2 class="pui-title">${plugin.name}</h2>
  <p class="pui-desc">Plugin ran successfully. This plugin has no custom UI.</p>
</body>
</html>`;
}

export default usePluginStore;
