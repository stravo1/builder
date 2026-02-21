import type Block from "@/block";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import { CanvasHistory } from "@/types/Builder/BuilderCanvas";
import getBlockTemplate from "@/utils/blockTemplate";
import {
	addPxToNumber,
	getBlock,
	getBlockInfo,
	getNumberFromPx,
	isBlock,
	isTargetEditable,
} from "@/utils/helpers";
import { clamp, useEventListener } from "@vueuse/core";
import { Ref } from "vue";

const builderStore = useBuilderStore();
const canvasStore = useCanvasStore();

export function useCanvasEvents(
	container: Ref<HTMLElement>,
	canvasProps: CanvasProps,
	canvasHistory: CanvasHistory,
	selectedBlocks: Ref<Block[]>,
	getRootBlock: () => Block,
	findBlock: (blockId: string) => Block | null,
) {
	let counter = 0;
	useEventListener(container, "mousedown", (ev: MouseEvent) => {
		if (builderStore.mode === "move") {
			return;
		}
		const initialX = ev.clientX;
		const initialY = ev.clientY;
		if (builderStore.mode === "select") {
			return;
		} else {
			if (builderStore.readOnlyMode) return;
			const pauseId = canvasHistory.value?.pause();
			ev.stopPropagation();
			let element = document.elementFromPoint(ev.x, ev.y) as HTMLElement;
			let block = getRootBlock();
			if (element) {
				if (element.dataset.blockId) {
					block = findBlock(element.dataset.blockId) || block;
				}
			}
			let parentBlock = getRootBlock();
			if (element.dataset.blockId) {
				parentBlock = findBlock(element.dataset.blockId) || parentBlock;
				while (parentBlock && !parentBlock.canHaveChildren()) {
					parentBlock = parentBlock.getParentBlock() || getRootBlock();
				}
			}
			const child = getBlockTemplate(builderStore.mode);
			const parentElement = document.body.querySelector(
				`.canvas [data-block-id="${parentBlock.blockId}"]`,
			) as HTMLElement;
			const parentOldPosition = parentBlock.getStyle("position");
			if (parentOldPosition === "static" || parentOldPosition === "inherit" || !parentOldPosition) {
				parentBlock.setBaseStyle("position", "relative");
			}
			const parentElementBounds = parentElement.getBoundingClientRect();
			let x = (ev.x - parentElementBounds.left) / canvasProps.scale;
			let y = (ev.y - parentElementBounds.top) / canvasProps.scale;
			const parentWidth = getNumberFromPx(getComputedStyle(parentElement).width);
			const parentHeight = getNumberFromPx(getComputedStyle(parentElement).height);

			const childBlock = parentBlock.addChild(child);
			childBlock.setBaseStyle("position", "absolute");
			childBlock.setBaseStyle("top", addPxToNumber(y));
			childBlock.setBaseStyle("left", addPxToNumber(x));
			if (builderStore.mode === "container" || builderStore.mode === "repeater") {
				const colors = ["#ededed", "#e2e2e2", "#c7c7c7"];
				childBlock.setBaseStyle("backgroundColor", colors[counter % colors.length]);
				counter++;
			}

			const mouseMoveHandler = (mouseMoveEvent: MouseEvent) => {
				if (builderStore.mode === "text") {
					return;
				} else {
					mouseMoveEvent.preventDefault();
					let width = (mouseMoveEvent.clientX - initialX) / canvasProps.scale;
					let height = (mouseMoveEvent.clientY - initialY) / canvasProps.scale;
					width = clamp(width, 0, parentWidth);
					height = clamp(height, 0, parentHeight);
					const setFullWidth = width === parentWidth;
					childBlock.setBaseStyle("width", setFullWidth ? "100%" : addPxToNumber(width));
					childBlock.setBaseStyle("height", addPxToNumber(height));
				}
			};
			useEventListener(document, "mousemove", mouseMoveHandler);
			useEventListener(
				document,
				"mouseup",
				() => {
					document.removeEventListener("mousemove", mouseMoveHandler);
					parentBlock.setBaseStyle("position", parentOldPosition || "static");
					childBlock.setBaseStyle("position", "static");
					childBlock.setBaseStyle("top", "auto");
					childBlock.setBaseStyle("left", "auto");
					setTimeout(() => {
						builderStore.mode = "select";
					}, 50);
					if (builderStore.mode === "text") {
						pauseId && canvasHistory.value?.resume(pauseId, true);
						canvasStore.editableBlock = childBlock;
						return;
					}
					if (parentBlock.isGrid()) {
						childBlock.setStyle("width", "auto");
						childBlock.setStyle("height", "100%");
					} else {
						if (getNumberFromPx(childBlock.getStyle("width")) < 100) {
							childBlock.setBaseStyle("width", "100%");
						}
						if (getNumberFromPx(childBlock.getStyle("height")) < 100) {
							childBlock.setBaseStyle("height", "200px");
						}
					}
					pauseId && canvasHistory.value?.resume(pauseId, true);
				},
				{ once: true },
			);
		}
	});

	// Touch/stylus support for block creation (non-select/move modes)
	useEventListener(container, "pointerdown", (ev: PointerEvent) => {
		if (ev.pointerType === "mouse") return;
		if (builderStore.mode === "move" || builderStore.mode === "select") return;
		if (builderStore.readOnlyMode) return;

		const initialX = ev.clientX;
		const initialY = ev.clientY;
		const startPointerId = ev.pointerId;
		const pauseId = canvasHistory.value?.pause();
		ev.stopPropagation();
		let element = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement;
		let parentBlock = getRootBlock();
		if (element?.dataset.blockId) {
			parentBlock = findBlock(element.dataset.blockId) || parentBlock;
			while (parentBlock && !parentBlock.canHaveChildren()) {
				parentBlock = parentBlock.getParentBlock() || getRootBlock();
			}
		}
		const child = getBlockTemplate(builderStore.mode);
		const parentElement = document.body.querySelector(
			`.canvas [data-block-id="${parentBlock.blockId}"]`,
		) as HTMLElement;
		const parentOldPosition = parentBlock.getStyle("position");
		if (parentOldPosition === "static" || parentOldPosition === "inherit" || !parentOldPosition) {
			parentBlock.setBaseStyle("position", "relative");
		}
		const parentElementBounds = parentElement.getBoundingClientRect();
		let x = (ev.clientX - parentElementBounds.left) / canvasProps.scale;
		let y = (ev.clientY - parentElementBounds.top) / canvasProps.scale;
		const parentWidth = getNumberFromPx(getComputedStyle(parentElement).width);
		const parentHeight = getNumberFromPx(getComputedStyle(parentElement).height);

		const childBlock = parentBlock.addChild(child);
		childBlock.setBaseStyle("position", "absolute");
		childBlock.setBaseStyle("top", addPxToNumber(y));
		childBlock.setBaseStyle("left", addPxToNumber(x));
		if (builderStore.mode === "container" || builderStore.mode === "repeater") {
			const colors = ["#ededed", "#e2e2e2", "#c7c7c7"];
			childBlock.setBaseStyle("backgroundColor", colors[counter % colors.length]);
			counter++;
		}

		const pointerMoveHandler = (e: PointerEvent) => {
			if (e.pointerId !== startPointerId) return;
			if (builderStore.mode === "text") return;
			e.preventDefault();
			let width = (e.clientX - initialX) / canvasProps.scale;
			let height = (e.clientY - initialY) / canvasProps.scale;
			width = clamp(width, 0, parentWidth);
			height = clamp(height, 0, parentHeight);
			const setFullWidth = width === parentWidth;
			childBlock.setBaseStyle("width", setFullWidth ? "100%" : addPxToNumber(width));
			childBlock.setBaseStyle("height", addPxToNumber(height));
		};
		const pointerUpHandler = (e: PointerEvent) => {
			if (e.pointerId !== startPointerId) return;
			document.removeEventListener("pointermove", pointerMoveHandler);
			document.removeEventListener("pointerup", pointerUpHandler);
			parentBlock.setBaseStyle("position", parentOldPosition || "static");
			childBlock.setBaseStyle("position", "static");
			childBlock.setBaseStyle("top", "auto");
			childBlock.setBaseStyle("left", "auto");
			setTimeout(() => {
				builderStore.mode = "select";
			}, 50);
			if (builderStore.mode === "text") {
				pauseId && canvasHistory.value?.resume(pauseId, true);
				canvasStore.editableBlock = childBlock;
				return;
			}
			if (parentBlock.isGrid()) {
				childBlock.setStyle("width", "auto");
				childBlock.setStyle("height", "100%");
			} else {
				if (getNumberFromPx(childBlock.getStyle("width")) < 100) {
					childBlock.setBaseStyle("width", "100%");
				}
				if (getNumberFromPx(childBlock.getStyle("height")) < 100) {
					childBlock.setBaseStyle("height", "200px");
				}
			}
			pauseId && canvasHistory.value?.resume(pauseId, true);
		};
		document.addEventListener("pointermove", pointerMoveHandler, { passive: false });
		document.addEventListener("pointerup", pointerUpHandler);
	});

	const startCanvasPan = (initialX: number, initialY: number, stopSignal: { stop: boolean }) => {
		const initialTranslateX = canvasProps.translateX;
		const initialTranslateY = canvasProps.translateY;
		return (currentX: number, currentY: number) => {
			if (stopSignal.stop) return;
			const diffX = (currentX - initialX) / canvasProps.scale;
			const diffY = (currentY - initialY) / canvasProps.scale;
			canvasProps.translateX = initialTranslateX + diffX;
			canvasProps.translateY = initialTranslateY + diffY;
		};
	};

	useEventListener(container, "mousedown", (ev: MouseEvent) => {
		if (builderStore.mode === "move") {
			container.value.style.cursor = "grabbing";
			const stopSignal = { stop: false };
			const applyPan = startCanvasPan(ev.clientX, ev.clientY, stopSignal);
			const mouseMoveHandler = (mouseMoveEvent: MouseEvent) => {
				mouseMoveEvent.preventDefault();
				applyPan(mouseMoveEvent.clientX, mouseMoveEvent.clientY);
			};
			useEventListener(document, "mousemove", mouseMoveHandler);
			useEventListener(
				document,
				"mouseup",
				() => {
					stopSignal.stop = true;
					document.removeEventListener("mousemove", mouseMoveHandler);
					container.value.style.cursor = "grab";
				},
				{ once: true },
			);
			ev.stopPropagation();
			ev.preventDefault();
		}
	});

	// Touch/stylus support for "move" mode canvas panning
	useEventListener(container, "pointerdown", (ev: PointerEvent) => {
		if (ev.pointerType === "mouse") return;
		if (builderStore.mode !== "move") return;
		container.value.style.cursor = "grabbing";
		const startPointerId = ev.pointerId;
		const stopSignal = { stop: false };
		const applyPan = startCanvasPan(ev.clientX, ev.clientY, stopSignal);

		const pointerMoveHandler = (e: PointerEvent) => {
			if (e.pointerId !== startPointerId) return;
			e.preventDefault();
			applyPan(e.clientX, e.clientY);
		};
		const pointerUpHandler = (e: PointerEvent) => {
			if (e.pointerId !== startPointerId) return;
			stopSignal.stop = true;
			document.removeEventListener("pointermove", pointerMoveHandler);
			document.removeEventListener("pointerup", pointerUpHandler);
			container.value.style.cursor = "grab";
		};
		document.addEventListener("pointermove", pointerMoveHandler, { passive: false });
		document.addEventListener("pointerup", pointerUpHandler);
		ev.stopPropagation();
		ev.preventDefault();
	});

	useEventListener(document, "keydown", (ev: KeyboardEvent) => {
		// make sure reference container is not hidden or not editable
		if (!container.value.offsetParent || isTargetEditable(ev) || selectedBlocks.value.length !== 1) {
			return;
		}

		const selectedBlock = selectedBlocks.value[0];

		const selectBlock = (block: Block | null) => {
			// TODO: Use canvas's selectBlock instead of canvasStore's to avoid mixup with other canvas
			if (block) canvasStore.selectBlock(block, null, true, true);
			return !!block;
		};

		const selectSibling = (direction: "previous" | "next", fallback: () => void) => {
			selectBlock(selectedBlock.getSiblingBlock(direction)) || fallback();
		};

		const selectParent = () => selectBlock(selectedBlock.getParentBlock());

		const selectFirstChild = () => selectBlock(selectedBlock.children[0]);

		const selectNextSiblingOrParent = () => {
			let sibling = selectedBlock.getSiblingBlock("next");
			let parentBlock = selectedBlock.getParentBlock();
			while (!sibling && parentBlock) {
				sibling = parentBlock.getSiblingBlock("next");
				parentBlock = parentBlock.getParentBlock();
			}
			selectBlock(sibling);
		};

		const selectLastChildInTree = (block: Block) => {
			let currentBlock = block;
			while (builderStore.activeLayers?.isExpandedInTree(currentBlock)) {
				const lastChild = currentBlock.getLastChild() as Block;
				if (!lastChild) break;
				currentBlock = lastChild;
			}
			selectBlock(currentBlock);
		};

		const arrowKeyHandlers = {
			ArrowLeft: () => {
				builderStore.activeLayers?.isExpandedInTree(selectedBlock)
					? builderStore.activeLayers.toggleExpanded(selectedBlock)
					: selectSibling("previous", selectParent);
			},
			ArrowRight: () => {
				selectedBlock.hasChildren() && selectedBlock.isVisible()
					? (builderStore.activeLayers?.toggleExpanded(selectedBlock), selectFirstChild())
					: selectNextSiblingOrParent();
			},
			ArrowUp: () => {
				const previousSibling = selectedBlock.getSiblingBlock("previous");
				previousSibling ? selectLastChildInTree(previousSibling) : selectParent();
			},
			ArrowDown: () => {
				builderStore.activeLayers?.isExpandedInTree(selectedBlock) &&
				selectedBlock.hasChildren() &&
				selectedBlock.isVisible()
					? selectFirstChild()
					: selectNextSiblingOrParent();
			},
		};

		const handler = arrowKeyHandlers[ev.key as keyof typeof arrowKeyHandlers];
		if (handler) {
			handler();
			ev.preventDefault();
		}
	});

	useEventListener(container, "mouseover", handleMouseOver);
}

function handleMouseOver(e: MouseEvent) {
	if (!isBlock(e)) {
		canvasStore.activeCanvas?.setHoveredBlock(null);
		return;
	}
	if (builderStore.mode === "move" || canvasStore.activeCanvas?.resizingBlock) return;
	const block = getBlock(e);
	const { breakpoint } = getBlockInfo(e);
	canvasStore.activeCanvas?.setHoveredBlock(block?.blockId || null);
	canvasStore.activeCanvas?.setHoveredBreakpoint(breakpoint);
	e.stopPropagation();
}
