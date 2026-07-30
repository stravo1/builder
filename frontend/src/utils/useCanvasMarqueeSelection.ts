import type Block from "@/block";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import type { CanvasProps } from "@/types/Builder/BuilderCanvas";
import {
	getElementRectInEditor,
	getEventPointInEditor,
	startCanvasDrag,
	type CanvasPoint,
} from "@/utils/canvasFrame";
import { computed, reactive, ref, type Ref } from "vue";

const MIN_MARQUEE_DRAG = 5;
// Blocks must overlap the selection by at least this fraction of their area,
// unless fully contained — in which case they are always selected.
const OVERLAP_SELECTION_THRESHOLD = 0.5;

type BlockRectSnapshot = { blockId: string; rect: DOMRect; area: number; block: Block; el: HTMLElement };

const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
	if (a.size !== b.size) return false;
	for (const id of a) if (!b.has(id)) return false;
	return true;
};

type UseCanvasMarqueeSelectionOptions = {
	canvasProps: CanvasProps;
	activeBreakpoint: Ref<string | null>;
	selectedBlockIds: Ref<Set<string>>;
	findBlock: (id: string) => Block | null;
	setActiveBreakpoint: (breakpoint: string | null) => void;
	setHoveredBreakpoint: (breakpoint: string | null) => void;
};

export function useCanvasMarqueeSelection(options: UseCanvasMarqueeSelectionOptions) {
	const {
		canvasProps,
		activeBreakpoint,
		selectedBlockIds,
		findBlock,
		setActiveBreakpoint,
		setHoveredBreakpoint,
	} = options;

	const builderStore = useBuilderStore();
	const canvasStore = useCanvasStore();
	const suppressNextClick = ref(false);
	const marqueeAdditiveSelection = ref(false);
	const marqueeBreakpoint = ref<string | null>(null);
	const marqueeInitialSelection = ref<Set<string>>(new Set());
	// Cached block rects — snapshotted once when drag starts; blocks don't move during a marquee
	let blockRectCache: BlockRectSnapshot[] = [];
	let stopMarqueeDrag: (() => void) | null = null;
	let rafId: number | null = null;
	// Tracks which blocks currently have the DOM highlight attribute (no Vue overhead)
	let marqueePreviewIds = new Set<string>();
	const marquee = reactive({
		active: false,
		visible: false,
		startX: 0,
		startY: 0,
		currentX: 0,
		currentY: 0,
	});

	const marqueeStyle = computed(() => {
		const left = Math.min(marquee.startX, marquee.currentX);
		const top = Math.min(marquee.startY, marquee.currentY);
		const width = Math.abs(marquee.currentX - marquee.startX);
		const height = Math.abs(marquee.currentY - marquee.startY);

		return {
			left: `${left}px`,
			top: `${top}px`,
			width: `${width}px`,
			height: `${height}px`,
			border: "1px solid rgba(59, 130, 246, 0.85)",
			background: "rgba(59, 130, 246, 0.12)",
		};
	});

	const clearMarqueeDOMHighlights = () => {
		for (const entry of blockRectCache) {
			entry.el.removeAttribute("data-marquee-selected");
		}
		marqueePreviewIds = new Set();
	};

	const cancelMarqueeOnDrag = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		clearMarqueeDOMHighlights();
		marquee.active = false;
		marquee.visible = false;
		blockRectCache = [];
		canvasStore.isMarqueeActive = false;
		removeWindowListeners();
	};

	const removeWindowListeners = () => {
		stopMarqueeDrag?.();
		stopMarqueeDrag = null;
		window.removeEventListener("dragstart", cancelMarqueeOnDrag);
	};

	const handleMarqueeStart = (ev: MouseEvent) => {
		if (!shouldStartMarquee(ev)) {
			return;
		}
		// preventDefault only once we're committing to a marquee — calling it
		// unconditionally swallows native caret placement inside editable text blocks
		ev.preventDefault();

		// The marquee box and the cached rects are drawn and compared in editor
		// coordinates, but the press can come from either document.
		const start = getEventPointInEditor(ev);
		marquee.active = true;
		marquee.visible = false;
		marquee.startX = start.x;
		marquee.startY = start.y;
		marquee.currentX = start.x;
		marquee.currentY = start.y;
		marqueeAdditiveSelection.value = ev.shiftKey || ev.metaKey || ev.ctrlKey;
		marqueeInitialSelection.value = new Set(selectedBlockIds.value);
		marqueeBreakpoint.value = getBreakpointAtPoint(start.x, start.y);

		// The capture layer keeps the whole drag in the editor document, even when the
		// pointer travels over the canvas frame or a side panel. It waits for real
		// travel, so a plain press on canvas chrome still turns into a click.
		stopMarqueeDrag = startCanvasDrag(ev, {
			threshold: MIN_MARQUEE_DRAG,
			onMove: ({ point }) => handleMarqueeMove(point),
			onEnd: handleMarqueeEnd,
		});
		// Cancel marquee if the browser starts an HTML5 block drag (mouseup won't fire during drag)
		window.addEventListener("dragstart", cancelMarqueeOnDrag);
	};

	const canvasDocument = () => canvasProps.frameDocument || document;

	const snapshotBlockRects = (): BlockRectSnapshot[] => {
		const target = marqueeBreakpoint.value || activeBreakpoint.value;
		const elements = canvasDocument().querySelectorAll<HTMLElement>(
			".__builder_component__[data-block-id][data-breakpoint]",
		);
		const result: BlockRectSnapshot[] = [];
		for (const el of elements) {
			if ((el.dataset.breakpoint || null) !== target) continue;
			const blockId = el.dataset.blockId;
			if (!blockId || blockId === "root") continue;
			const rect = getElementRectInEditor(el);
			if (!rect.width || !rect.height) continue;
			const block = findBlock(blockId);
			if (!block) continue;
			// Only select the component root — never select internal children of a component
			if (block.isChildOfComponentBlock()) continue;
			result.push({ blockId, rect, area: rect.width * rect.height, block, el });
		}
		return result;
	};

	// Updates block highlight during drag via DOM attribute — zero Vue reactivity overhead.
	// Vue reactive state is only committed once at drag end.
	const updateMarqueeDOMHighlights = () => {
		const newIds = getMarqueeIntersectingBlockIds();
		for (const entry of blockRectCache) {
			const hadHighlight = marqueePreviewIds.has(entry.blockId);
			const hasHighlight = newIds.has(entry.blockId);
			if (hadHighlight !== hasHighlight) {
				if (hasHighlight) {
					entry.el.setAttribute("data-marquee-selected", "");
				} else {
					entry.el.removeAttribute("data-marquee-selected");
				}
			}
		}
		marqueePreviewIds = newIds;
	};

	const handleMarqueeMove = (point: CanvasPoint) => {
		if (!marquee.active) return;

		// Always capture the latest position — even if a rAF is already pending
		marquee.currentX = point.x;
		marquee.currentY = point.y;

		if (rafId !== null) return; // coalesce: only one rAF per frame

		rafId = requestAnimationFrame(() => {
			rafId = null;

			if (!marquee.visible) {
				const dx = Math.abs(marquee.currentX - marquee.startX);
				const dy = Math.abs(marquee.currentY - marquee.startY);
				if (dx >= MIN_MARQUEE_DRAG || dy >= MIN_MARQUEE_DRAG) {
					marquee.visible = true;
					// Snapshot rects once — blocks don't move during a marquee drag
					blockRectCache = snapshotBlockRects();
					canvasStore.isMarqueeActive = true;
					canvasStore.activeCanvas?.setHoveredBlock(null);
					if (canvasStore.activeCanvas) {
						canvasStore.activeCanvas.clearSelection();
					}
				}
			}

			// Drive highlight via DOM only — no Vue reactive updates per frame
			if (marquee.visible) updateMarqueeDOMHighlights();
		});
	};

	const handleMarqueeEnd = () => {
		if (!marquee.active) return;

		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}

		removeWindowListeners();

		if (marquee.visible) {
			// Remove DOM highlights, then commit selection to Vue reactive state exactly once
			clearMarqueeDOMHighlights();
			applyMarqueeSelection();
			suppressNextClick.value = true;
			// Also prevent useBlockEventHandlers from selecting the block under the cursor
			canvasStore.preventClick = true;
			setTimeout(() => {
				canvasStore.preventClick = false;
			}, 50);
		}

		marquee.active = false;
		marquee.visible = false;
		blockRectCache = [];
		canvasStore.isMarqueeActive = false;
	};

	const shouldStartMarquee = (ev: MouseEvent) => {
		if (ev.button !== 0) return false;
		if (builderStore.mode !== "select") return false;
		if (builderStore.readOnlyMode) return false;
		if (canvasStore.isDragging || canvasProps.panning || canvasProps.scaling) return false;

		const target = ev.target as HTMLElement | null;
		if (!target) return false;

		if (target.closest("input, textarea, select, button, a, [contenteditable='true']")) {
			return false;
		}

		// Pressing on an actual block starts a block drag/selection (see
		// useBlockEventHandlers), not a marquee. The root block (page background)
		// and truly empty canvas still start a marquee.
		const blockEl = target.closest(".__builder_component__") as HTMLElement | null;
		if (blockEl && blockEl.dataset.blockId && blockEl.dataset.blockId !== "root") {
			return false;
		}

		return true;
	};

	const getBreakpointAtPoint = (x: number, y: number) => {
		const canvases = Array.from(
			canvasDocument().querySelectorAll(".canvas[data-breakpoint]"),
		) as HTMLElement[];

		for (const canvasElement of canvases) {
			const rect = getElementRectInEditor(canvasElement);
			if (!rect.width || !rect.height) continue;
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				return canvasElement.dataset.breakpoint || activeBreakpoint.value;
			}
		}

		return activeBreakpoint.value;
	};

	const getMarqueeIntersectingBlockIds = () => {
		if (!blockRectCache.length) return new Set<string>();

		const selectionRect = {
			left: Math.min(marquee.startX, marquee.currentX),
			right: Math.max(marquee.startX, marquee.currentX),
			top: Math.min(marquee.startY, marquee.currentY),
			bottom: Math.max(marquee.startY, marquee.currentY),
		};

		const intersectingIds = new Set<string>();
		const fullyContainedIds = new Set<string>();
		// Build a map once so the parent-walk loop is O(1) per lookup
		const blockByIdInCache = new Map<string, BlockRectSnapshot>();

		for (const entry of blockRectCache) {
			blockByIdInCache.set(entry.blockId, entry);
			const { blockId, rect, area } = entry;

			const intersects = !(
				rect.right < selectionRect.left ||
				rect.left > selectionRect.right ||
				rect.bottom < selectionRect.top ||
				rect.top > selectionRect.bottom
			);
			if (!intersects) continue;

			const fullyContained =
				rect.left >= selectionRect.left &&
				rect.right <= selectionRect.right &&
				rect.top >= selectionRect.top &&
				rect.bottom <= selectionRect.bottom;

			if (fullyContained) {
				intersectingIds.add(blockId);
				fullyContainedIds.add(blockId);
				continue;
			}

			const iW = Math.min(rect.right, selectionRect.right) - Math.max(rect.left, selectionRect.left);
			const iH = Math.min(rect.bottom, selectionRect.bottom) - Math.max(rect.top, selectionRect.top);
			const overlapRatio = area > 0 ? (Math.max(0, iW) * Math.max(0, iH)) / area : 0;
			if (overlapRatio > OVERLAP_SELECTION_THRESHOLD) {
				intersectingIds.add(blockId);
			}
		}

		const parentOnlyIds = new Set<string>();
		for (const blockId of intersectingIds) {
			const entry = blockByIdInCache.get(blockId);
			if (!entry) continue;
			let parent = entry.block.getParentBlock();
			let hasFullyContainedAncestor = false;
			while (parent) {
				if (fullyContainedIds.has(parent.blockId)) {
					hasFullyContainedAncestor = true;
					break;
				}
				parent = parent.getParentBlock();
			}
			if (!hasFullyContainedAncestor) parentOnlyIds.add(blockId);
		}

		return parentOnlyIds;
	};

	const applyMarqueeSelection = () => {
		const targetBreakpoint = marqueeBreakpoint.value || activeBreakpoint.value;
		const intersectingIds = getMarqueeIntersectingBlockIds();
		const nextIds = new Set<string>();

		if (marqueeAdditiveSelection.value) {
			for (const id of marqueeInitialSelection.value) nextIds.add(id);
		}
		for (const id of intersectingIds) nextIds.add(id);

		// Skip reactivity churn when the selection set hasn't actually changed
		if (!setsEqual(selectedBlockIds.value, nextIds)) {
			selectedBlockIds.value = nextIds;
		}

		if (targetBreakpoint) {
			setActiveBreakpoint(targetBreakpoint);
			setHoveredBreakpoint(targetBreakpoint);
		}
	};

	return {
		marquee,
		marqueeStyle,
		suppressNextClick,
		handleMarqueeStart,
		cleanupMarqueeListeners: removeWindowListeners,
	};
}
