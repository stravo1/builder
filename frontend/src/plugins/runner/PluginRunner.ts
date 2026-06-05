import { PluginAPIService } from "@/plugins/api/PluginAPIService";
import type { PluginBundle, PluginManifest, PluginUIMessage } from "@/plugins/api/types";
import { PLUGIN_API_VERSION } from "@/plugins/api/types";
import { QuickJSSandbox } from "@/plugins/sandbox/QuickJSSandbox";

export type PluginRunnerState = "idle" | "loading" | "running" | "error";

export class PluginRunner {
	private sandbox: QuickJSSandbox | null = null;
	private apiService: PluginAPIService | null = null;
	private activePlugin: PluginBundle | null = null;
	state: PluginRunnerState = "idle";
	error: string | null = null;

	getActivePlugin() {
		return this.activePlugin;
	}

	async run(plugin: PluginBundle, uiBridge?: (message: unknown) => void) {
		await this.close(false);

		this.validateManifest(plugin.manifest);
		this.state = "loading";
		this.error = null;
		this.activePlugin = plugin;

		const permissions = plugin.manifest.permissions || [];
		this.apiService = new PluginAPIService(permissions);
		if (uiBridge) {
			this.apiService.setUIBridge(uiBridge);
		}

		this.sandbox = new QuickJSSandbox(this.apiService);

		try {
			await this.sandbox.init();
			this.state = "running";
			await this.runPluginScript(plugin);
		} catch (err) {
			this.state = "error";
			this.error = err instanceof Error ? err.message : String(err);
			throw err;
		}
	}

	private runPluginScript(plugin: PluginBundle) {
		return this.sandbox!.runPlugin(plugin.mainScript, { pluginId: plugin.id });
	}

	handleUIMessage(message: PluginUIMessage) {
		if (!this.activePlugin || message.pluginId !== this.activePlugin.id) return;
		this.apiService?.handleUIMessage(message.payload);
	}

	async close(resetState = true) {
		this.apiService?.stopWatching();
		this.apiService?.clearHistoryBatches();
		this.sandbox?.dispose();
		this.sandbox = null;
		this.apiService = null;
		this.activePlugin = null;
		if (resetState) {
			this.state = "idle";
			this.error = null;
		}
	}

	private validateManifest(manifest: PluginManifest) {
		if (manifest.apiVersion !== PLUGIN_API_VERSION) {
			throw new Error(
				`Unsupported plugin API version ${manifest.apiVersion}. Expected ${PLUGIN_API_VERSION}.`,
			);
		}
		if (!manifest.id || !manifest.main) {
			throw new Error("Invalid plugin manifest");
		}
	}
}

export const pluginRunner = new PluginRunner();
