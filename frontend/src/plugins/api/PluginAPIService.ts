import type Block from "@/block";
import useCanvasStore from "@/stores/canvasStore";
import type { PauseId } from "@/utils/useCanvasHistory";
import { generateId } from "@/utils/helpers";
import { computed, watch, type WatchStopHandle } from "vue";
import {
	applyPluginBlockPatch,
	collectBlocksByElement,
	createBlockOptionsFromTemplate,
	toPluginBlock,
} from "./adapters";
import type {
	PluginBlock,
	PluginBlockPatch,
	PluginBuilderAPI,
	PluginCreateBlockOptions,
	PluginEventType,
	PluginPermission,
	PluginViewport,
	PluginViewportPatch,
} from "./types";

type UIMessageHandler = (message: unknown) => void;
type EventHandler = (payload: unknown) => void;

export class PluginAPIService {
	private historyBatches = new Map<string, PauseId>();
	private uiMessageHandler: UIMessageHandler | null = null;
	private uiPostMessage: ((message: unknown) => void) | null = null;
	private eventListeners = new Map<PluginEventType, Set<EventHandler>>();
	private watchStoppers: WatchStopHandle[] = [];
	private watchingEvents = new Set<PluginEventType>();

	constructor(private permissions: PluginPermission[] = []) {}

	setUIBridge(postMessage: (message: unknown) => void) {
		this.uiPostMessage = postMessage;
	}

	private canvas() {
		return useCanvasStore().activeCanvas;
	}

	private assertPermission(permission: PluginPermission) {
		if (this.permissions.length && !this.permissions.includes(permission)) {
			throw new Error(`Plugin lacks permission: ${permission}`);
		}
	}

	private getBlockById(id: string): Block | null {
		return this.canvas()?.findBlock(id) || null;
	}

	getRootBlock(): PluginBlock | null {
		this.assertPermission("blocks:read");
		const root = this.canvas()?.getRootBlock();
		return root ? toPluginBlock(root) : null;
	}

	getSelectedBlocks(): PluginBlock[] {
		this.assertPermission("blocks:read");
		return (this.canvas()?.selectedBlocks || []).map((block) => toPluginBlock(block));
	}

	findBlock(id: string): PluginBlock | null {
		this.assertPermission("blocks:read");
		const block = this.getBlockById(id);
		return block ? toPluginBlock(block) : null;
	}

	getBlocksByElement(tag: string): PluginBlock[] {
		this.assertPermission("blocks:read");
		const root = this.canvas()?.getRootBlock();
		if (!root) return [];
		return collectBlocksByElement(root, tag);
	}

	createBlock(options: PluginCreateBlockOptions): PluginBlock {
		this.assertPermission("blocks:write");
		const canvas = this.canvas();
		if (!canvas) throw new Error("No active canvas");

		const blockOptions = createBlockOptionsFromTemplate(options);
		let parent: Block;

		if (options.parentId) {
			const found = this.getBlockById(options.parentId);
			if (!found) throw new Error(`Parent block not found: ${options.parentId}`);
			parent = found;
		} else {
			parent = canvas.getRootBlock();
		}

		const insertIndex = options.index ?? parent.children.length;
		parent.addChild(blockOptions, insertIndex, false);
		const child = parent.children[Math.min(insertIndex, parent.children.length - 1)];
		return toPluginBlock(child);
	}

	updateBlock(id: string, patch: PluginBlockPatch): PluginBlock {
		this.assertPermission("blocks:write");
		const block = this.getBlockById(id);
		if (!block) throw new Error(`Block not found: ${id}`);
		if (block.isRoot()) throw new Error("Cannot update root block via plugin API");
		applyPluginBlockPatch(block, patch);
		return toPluginBlock(block);
	}

	deleteBlock(id: string): void {
		this.assertPermission("blocks:write");
		const canvas = this.canvas();
		const block = this.getBlockById(id);
		if (!block) throw new Error(`Block not found: ${id}`);
		if (block.isRoot()) throw new Error("Cannot delete root block");
		canvas?.removeBlock(block);
	}

	selectBlocks(ids: string[]): void {
		this.assertPermission("selection:write");
		const canvas = this.canvas();
		if (!canvas || !ids.length) return;

		if (ids.length === 1) {
			const block = this.getBlockById(ids[0]);
			if (block) canvas.selectBlock(block);
			return;
		}

		canvas.clearSelection();
		for (const id of ids) {
			const block = this.getBlockById(id);
			if (block) canvas.toggleBlockSelection(block);
		}
	}

	clearSelection(): void {
		this.assertPermission("selection:write");
		this.canvas()?.clearSelection();
	}

	getViewport(): PluginViewport {
		this.assertPermission("viewport:read");
		const props = this.canvas()?.canvasProps;
		return {
			scale: props?.scale ?? 1,
			translateX: props?.translateX ?? 0,
			translateY: props?.translateY ?? 0,
		};
	}

	setViewport(patch: PluginViewportPatch): void {
		this.assertPermission("viewport:write");
		const props = this.canvas()?.canvasProps;
		if (!props) return;
		if (patch.scale !== undefined) props.scale = patch.scale;
		if (patch.translateX !== undefined) props.translateX = patch.translateX;
		if (patch.translateY !== undefined) props.translateY = patch.translateY;
	}

	beginHistoryBatch(): string {
		const history = this.canvas()?.history;
		if (!history) throw new Error("Canvas history unavailable");
		const batchId = generateId();
		const pauseId = history.pause();
		this.historyBatches.set(batchId, pauseId);
		return batchId;
	}

	endHistoryBatch(batchId: string): void {
		const history = this.canvas()?.history;
		const pauseId = this.historyBatches.get(batchId);
		if (!history || !pauseId) throw new Error(`Unknown history batch: ${batchId}`);
		history.resume(pauseId, true);
		this.historyBatches.delete(batchId);
	}

	postUIMessage(message: unknown) {
		this.uiPostMessage?.(message);
	}

	onUIMessage(handler: UIMessageHandler) {
		this.uiMessageHandler = handler;
	}

	handleUIMessage(message: unknown) {
		this.uiMessageHandler?.(message);
	}

	clearHistoryBatches() {
		const history = this.canvas()?.history;
		for (const pauseId of this.historyBatches.values()) {
			history?.resume(pauseId, false, true);
		}
		this.historyBatches.clear();
	}

	on(event: PluginEventType, handler: EventHandler) {
		let handlers = this.eventListeners.get(event);
		if (!handlers) {
			handlers = new Set();
			this.eventListeners.set(event, handlers);
		}
		handlers.add(handler);
		this.ensureWatcher(event);
	}

	off(event: PluginEventType, handler: EventHandler) {
		this.eventListeners.get(event)?.delete(handler);
	}

	private emit(event: PluginEventType, payload: unknown) {
		const handlers = this.eventListeners.get(event);
		if (!handlers) return;
		for (const handler of handlers) {
			try {
				handler(payload);
			} catch (e) {
				console.error(`Plugin event handler error (${event}):`, e);
			}
		}
	}

	private ensureWatcher(event: PluginEventType) {
		if (this.watchingEvents.has(event)) return;
		this.watchingEvents.add(event);

		const canvas = this.canvas();
		if (!canvas) return;

		if (event === "selectionChange") {
			const stop = watch(
				() => canvas.selectedBlockIds,
				() => {
					const blocks = (canvas.selectedBlocks || []).map((b: Block) => toPluginBlock(b));
					this.emit("selectionChange", { blocks });
				},
				{ deep: true },
			);
			this.watchStoppers.push(stop);
		} else if (event === "blockHover") {
			const hoveredBlock = computed(() => canvas.hoveredBlock);
			const stop = watch(hoveredBlock, (blockId) => {
				this.emit("blockHover", { blockId: blockId ?? null });
			});
			this.watchStoppers.push(stop);
		} else if (event === "breakpointChange") {
			const activeBreakpoint = computed(() => canvas.activeBreakpoint);
			const stop = watch(activeBreakpoint, (breakpoint) => {
				this.emit("breakpointChange", { breakpoint: breakpoint ?? "desktop" });
			});
			this.watchStoppers.push(stop);
		}
	}

	stopWatching() {
		for (const stop of this.watchStoppers) stop();
		this.watchStoppers = [];
		this.watchingEvents.clear();
		this.eventListeners.clear();
	}

	createBuilderAPI(): PluginBuilderAPI {
		return {
			getRootBlock: () => this.getRootBlock(),
			getSelectedBlocks: () => this.getSelectedBlocks(),
			findBlock: (id) => this.findBlock(id),
			getBlocksByElement: (tag) => this.getBlocksByElement(tag),
			createBlock: (options) => this.createBlock(options),
			updateBlock: (id, patch) => this.updateBlock(id, patch),
			deleteBlock: (id) => this.deleteBlock(id),
			selectBlocks: (ids) => this.selectBlocks(ids),
			clearSelection: () => this.clearSelection(),
			getViewport: () => this.getViewport(),
			setViewport: (patch) => this.setViewport(patch),
			history: {
				beginBatch: () => this.beginHistoryBatch(),
				endBatch: (batchId) => this.endHistoryBatch(batchId),
			},
			ui: {
				postMessage: (message) => this.postUIMessage(message),
				onMessage: (handler) => this.onUIMessage(handler),
			},
			on: (event, handler) => this.on(event, handler),
			off: (event, handler) => this.off(event, handler),
		};
	}
}
