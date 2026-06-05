import type { PluginAPIService } from "@/plugins/api/PluginAPIService";
import type { PluginBuilderAPI, PluginModule, PluginRunContext } from "@/plugins/api/types";
import { loadQuickJSModule } from "@/plugins/sandbox/loadQuickJS";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

const CONSOLE_BOOTSTRAP = `
globalThis.console = {
  log: function() { __builderHost.consoleLog(Array.prototype.map.call(arguments, function(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); },
  warn: function() { __builderHost.consoleWarn(Array.prototype.map.call(arguments, function(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); },
  error: function() { __builderHost.consoleError(Array.prototype.map.call(arguments, function(a) { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); },
};
`;

const BUILDER_BOOTSTRAP = `
globalThis.__builderHost = globalThis.__builderHost || {};
globalThis.builder = {
  getRootBlock: () => JSON.parse(__builderHost.getRootBlock()),
  getSelectedBlocks: () => JSON.parse(__builderHost.getSelectedBlocks()),
  findBlock: (id) => {
    const result = __builderHost.findBlock(id);
    return result ? JSON.parse(result) : null;
  },
  getBlocksByElement: (tag) => JSON.parse(__builderHost.getBlocksByElement(tag)),
  createBlock: (options) => JSON.parse(__builderHost.createBlock(JSON.stringify(options || {}))),
  updateBlock: (id, patch) => JSON.parse(__builderHost.updateBlock(id, JSON.stringify(patch || {}))),
  deleteBlock: (id) => __builderHost.deleteBlock(id),
  selectBlocks: (ids) => __builderHost.selectBlocks(JSON.stringify(ids || [])),
  clearSelection: () => __builderHost.clearSelection(),
  getViewport: () => JSON.parse(__builderHost.getViewport()),
  setViewport: (patch) => __builderHost.setViewport(JSON.stringify(patch || {})),
  history: {
    beginBatch: () => __builderHost.beginHistoryBatch(),
    endBatch: (batchId) => __builderHost.endHistoryBatch(batchId),
  },
  ui: {
    postMessage: (message) => __builderHost.postUIMessage(JSON.stringify(message ?? null)),
    onMessage: (handler) => {
      __builderHost.registerUIMessageHandler();
      globalThis.__uiMessageHandler = handler;
    },
  },
  on: (event, handler) => {
    if (!globalThis.__eventHandlers) globalThis.__eventHandlers = {};
    if (!globalThis.__eventHandlers[event]) globalThis.__eventHandlers[event] = [];
    globalThis.__eventHandlers[event].push(handler);
    __builderHost.subscribeEvent(event);
  },
  off: (event, handler) => {
    if (!globalThis.__eventHandlers || !globalThis.__eventHandlers[event]) return;
    globalThis.__eventHandlers[event] = globalThis.__eventHandlers[event].filter(function(h) { return h !== handler; });
  },
};
`;

function extractErrorMessage(dumped: unknown): string {
	if (typeof dumped === "string") return dumped;
	if (dumped && typeof dumped === "object") {
		const obj = dumped as Record<string, unknown>;
		const msg = obj.message ?? obj.name ?? "Plugin execution failed";
		const stack = obj.stack;
		if (stack && typeof stack === "string") {
			console.error("[plugin error]", stack);
		}
		return String(msg);
	}
	return String(dumped);
}

function normalizePluginSource(source: string): string {
	let code = source.trim();
	code = code.replace(/\bexport\s+default\s+/g, "var __pluginExport = ");
	if (!code.includes("__pluginExport")) {
		code = `var __pluginExport = ${code}`;
	}
	return code;
}

function exposeHostFunction(
	vm: QuickJSContext,
	hostObject: QuickJSHandle,
	name: string,
	fn: (...args: string[]) => string | void,
) {
	const handle = vm.newFunction(name, (...argHandles) => {
		try {
			const args = argHandles.map((handle) => vm.dump(handle) as string);
			const result = fn(...args);
			if (result === undefined) return vm.undefined;
			return vm.newString(result);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw vm.newError(message);
		}
	});
	vm.setProp(hostObject, name, handle);
	handle.dispose();
}

export class QuickJSSandbox {
	private vm: QuickJSContext | null = null;
	private hostObject: QuickJSHandle | null = null;
	private subscribedEvents = new Set<string>();

	constructor(private apiService: PluginAPIService) {}

	async init() {
		const QuickJS = await loadQuickJSModule();
		this.vm = QuickJS.newContext();
		const vm = this.vm;

		this.hostObject = vm.newObject();
		const builderAPI = this.apiService.createBuilderAPI();

		exposeHostFunction(vm, this.hostObject, "consoleLog", (msg) => { console.log(`[plugin]`, msg); });
		exposeHostFunction(vm, this.hostObject, "consoleWarn", (msg) => { console.warn(`[plugin]`, msg); });
		exposeHostFunction(vm, this.hostObject, "consoleError", (msg) => { console.error(`[plugin]`, msg); });

		exposeHostFunction(vm, this.hostObject, "getRootBlock", () =>
			JSON.stringify(builderAPI.getRootBlock()),
		);
		exposeHostFunction(vm, this.hostObject, "getSelectedBlocks", () =>
			JSON.stringify(builderAPI.getSelectedBlocks()),
		);
		exposeHostFunction(vm, this.hostObject, "findBlock", (id) =>
			JSON.stringify(builderAPI.findBlock(id)),
		);
		exposeHostFunction(vm, this.hostObject, "getBlocksByElement", (tag) =>
			JSON.stringify(builderAPI.getBlocksByElement(tag)),
		);
		exposeHostFunction(vm, this.hostObject, "createBlock", (optionsJson) =>
			JSON.stringify(builderAPI.createBlock(JSON.parse(optionsJson || "{}"))),
		);
		exposeHostFunction(vm, this.hostObject, "updateBlock", (id, patchJson) =>
			JSON.stringify(builderAPI.updateBlock(id, JSON.parse(patchJson || "{}"))),
		);
		exposeHostFunction(vm, this.hostObject, "deleteBlock", (id) => {
			builderAPI.deleteBlock(id);
		});
		exposeHostFunction(vm, this.hostObject, "selectBlocks", (idsJson) => {
			builderAPI.selectBlocks(JSON.parse(idsJson || "[]"));
		});
		exposeHostFunction(vm, this.hostObject, "clearSelection", () => {
			builderAPI.clearSelection();
		});
		exposeHostFunction(vm, this.hostObject, "getViewport", () => JSON.stringify(builderAPI.getViewport()));
		exposeHostFunction(vm, this.hostObject, "setViewport", (patchJson) => {
			builderAPI.setViewport(JSON.parse(patchJson || "{}"));
		});
		exposeHostFunction(vm, this.hostObject, "beginHistoryBatch", () => builderAPI.history.beginBatch());
		exposeHostFunction(vm, this.hostObject, "endHistoryBatch", (batchId) => {
			builderAPI.history.endBatch(batchId);
		});
		exposeHostFunction(vm, this.hostObject, "postUIMessage", (messageJson) => {
			builderAPI.ui.postMessage(JSON.parse(messageJson || "null"));
		});
		exposeHostFunction(vm, this.hostObject, "registerUIMessageHandler", () => {
			builderAPI.ui.onMessage((message) => {
				const payload = JSON.stringify(message ?? null);
				vm.unwrapResult(
					vm.evalCode(`globalThis.__uiMessageHandler && globalThis.__uiMessageHandler(${payload})`),
				).consume(() => undefined);
			});
		});
		exposeHostFunction(vm, this.hostObject, "subscribeEvent", (eventName) => {
			if (this.subscribedEvents.has(eventName)) return;
			this.subscribedEvents.add(eventName);
			builderAPI.on(eventName as any, (payload) => {
				const payloadJson = JSON.stringify(payload ?? null);
				const code = `(function() {
					var handlers = globalThis.__eventHandlers && globalThis.__eventHandlers[${JSON.stringify(eventName)}];
					if (handlers) { for (var i = 0; i < handlers.length; i++) { handlers[i](${payloadJson}); } }
				})()`;
				try {
					vm.unwrapResult(vm.evalCode(code)).consume(() => undefined);
				} catch (e) {
					console.error(`Plugin event dispatch error (${eventName}):`, e);
				}
			});
		});

		vm.setProp(vm.global, "__builderHost", this.hostObject);
		vm.unwrapResult(vm.evalCode(CONSOLE_BOOTSTRAP)).dispose();
		vm.unwrapResult(vm.evalCode(BUILDER_BOOTSTRAP)).dispose();
	}

	async runPlugin(mainScript: string, ctx: PluginRunContext): Promise<void> {
		if (!this.vm) await this.init();
		const vm = this.vm!;

		const normalized = normalizePluginSource(mainScript);
		const wrapped = `
${normalized}
if (typeof __pluginExport !== 'object' || typeof __pluginExport.run !== 'function') {
  throw new Error('Plugin must export an object with a run(ctx) method');
}
__pluginExport.run({ pluginId: ${JSON.stringify(ctx.pluginId)}, builder: globalThis.builder });
`;

		const result = vm.evalCode(wrapped);
		if (result.error) {
			const dumped = vm.dump(result.error);
			result.error.dispose();
			const message = extractErrorMessage(dumped);
			throw new Error(message);
		}
		result.value.dispose();
	}

	evalExpression<T = unknown>(expression: string): T {
		if (!this.vm) throw new Error("Sandbox not initialized");
		const result = this.vm.evalCode(expression);
		if (result.error) {
			const dumped = this.vm.dump(result.error);
			result.error.dispose();
			throw new Error(extractErrorMessage(dumped));
		}
		const value = this.vm.dump(result.value);
		result.value.dispose();
		return value as T;
	}

	dispose() {
		this.subscribedEvents.clear();
		this.hostObject?.dispose();
		this.hostObject = null;
		this.vm?.dispose();
		this.vm = null;
	}
}

export type { PluginBuilderAPI, PluginModule, PluginRunContext };
