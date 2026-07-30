import type Block from "@/block";
import useBlockTemplateStore from "@/stores/blockTemplateStore";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import useComponentStore from "@/stores/componentStore";
import {
	elementFromEditorPoint,
	getComputedStyleFor,
	getElementRectInEditor,
} from "@/utils/canvasFrame";
import { getLayoutDirection, type LayoutDirection } from "@/utils/dropGeometry";
import {
	getBlockCopy,
	getBlockInstance,
	getImageBlock,
	getVideoBlock,
	uploadBuilderAsset,
	uploadUserFont,
} from "@/utils/helpers";
import { useDropZone } from "@vueuse/core";
import { useTelemetry } from "frappe-ui/frappe";
import { onScopeDispose, Ref } from "vue";
import blockController from "./blockController";

const { capture } = useTelemetry();
const builderStore = useBuilderStore();
const canvasStore = useCanvasStore();
const componentStore = useComponentStore();
const blockTemplateStore = useBlockTemplateStore();

type DropPointer = Pick<DragEvent, "clientX" | "clientY" | "x" | "y" | "shiftKey">;

export function useCanvasDropZone(
	canvasContainer: Ref<HTMLElement>,
	block: Ref<Block | null>,
	findBlock: (id: string) => Block | null,
) {
	let pendingOver: DropPointer | null = null;
	let dragOverFrame: number | null = null;

	const { isOverDropZone } = useDropZone(canvasContainer, {
		onDrop: async (files, ev) => {
			if (builderStore.readOnlyMode) return;
			flushPendingDragOver();
			canvasStore.isDropping = true;
			if (files && files.length) {
				handleFileDrop(files, ev);
			} else {
				await handleBlockDrop(ev);
			}
			canvasStore.isDropping = false;
			canvasStore.resetDropTarget();
		},

		onOver: (files, ev) => {
			if (builderStore.readOnlyMode) return;
			queueDragOver(ev);
		},
	});

	onScopeDispose(cancelPendingDragOver);

	const canvasDocument = () => canvasStore.activeCanvas?.canvasProps?.frameDocument || document;

	function queueDragOver(ev: DragEvent) {
		pendingOver = getDropPointer(ev);
		if (dragOverFrame !== null) return;

		dragOverFrame = requestAnimationFrame(() => {
			dragOverFrame = null;
			const pointer = pendingOver;
			pendingOver = null;
			if (pointer) handleDragOver(pointer);
		});
	}

	function getDropPointer(ev: DragEvent): DropPointer {
		return {
			clientX: ev.clientX,
			clientY: ev.clientY,
			x: ev.x,
			y: ev.y,
			shiftKey: ev.shiftKey,
		};
	}

	function cancelPendingDragOver() {
		if (dragOverFrame !== null) {
			cancelAnimationFrame(dragOverFrame);
			dragOverFrame = null;
		}
		pendingOver = null;
	}

	function flushPendingDragOver() {
		if (dragOverFrame !== null) {
			cancelAnimationFrame(dragOverFrame);
			dragOverFrame = null;
		}
		const pointer = pendingOver;
		pendingOver = null;
		if (pointer) handleDragOver(pointer);
	}

	function handleDragOver(pointer: DropPointer) {
		const initialBlock = getInitialParentBlock(pointer);
		const shouldReplaceImage = initialBlock?.isImage();

		if (pointer.shiftKey || shouldReplaceImage) {
			const parentBlock = shouldReplaceImage ? initialBlock : getBlockToReplace(initialBlock);
			if (!parentBlock) return;

			canvasStore.activeCanvas?.setHoveredBlock(parentBlock.blockId);
			canvasStore.removeDropPlaceholder();
			canvasStore.dropTarget.parentBlock = parentBlock;
			canvasStore.dropTarget.index = 0;
			canvasStore.dropTarget.x = pointer.x;
			canvasStore.dropTarget.y = pointer.y;
			return;
		}

		const { parentBlock, index, layoutDirection } = findDropTarget(pointer);
		if (!parentBlock) return;

		canvasStore.activeCanvas?.setHoveredBlock(parentBlock.blockId);
		updateDropTarget(pointer, parentBlock, index, layoutDirection);
	}

	const getInitialParentBlock = (pointer: DropPointer) => {
		// The drag runs over a capture layer in the editor document, so the hit test has
		// to read through the iframe to find the block underneath.
		const element = elementFromEditorPoint(pointer.clientX, pointer.clientY) as HTMLElement;
		const targetElement = element?.closest(".__builder_component__") as HTMLElement;

		// set the hoveredBreakpoint from the target element to show placeholder at the correct breakpoint canvas
		const breakpoint =
			targetElement?.dataset.breakpoint || canvasStore.activeCanvas?.activeBreakpoint || null;
		if (breakpoint !== canvasStore.activeCanvas?.hoveredBreakpoint) {
			canvasStore.activeCanvas?.setHoveredBreakpoint(breakpoint);
		}

		let parentBlock = block.value as Block | null;
		if (targetElement && targetElement.dataset.blockId) {
			parentBlock = findBlock(targetElement.dataset.blockId) || parentBlock;
		}
		return parentBlock;
	};

	const getBlockToReplace = (initialBlock: Block | null | undefined) => {
		let parentBlock = initialBlock || null;
		while (parentBlock && parentBlock.isChildOfComponent) {
			parentBlock = parentBlock.getParentBlock();
		}
		return parentBlock;
	};

	const getBlockElement = (block: Block) => {
		const breakpoint =
			canvasStore.activeCanvas?.hoveredBreakpoint || canvasStore.activeCanvas?.activeBreakpoint;
		return canvasDocument().querySelector(
			`.__builder_component__[data-block-id="${block.blockId}"][data-breakpoint="${breakpoint}"]`,
		) as HTMLElement;
	};

	const findDropTarget = (pointer: DropPointer) => {
		if (canvasStore.dropTarget.x === pointer.x && canvasStore.dropTarget.y === pointer.y) return {};
		let parentBlock = getInitialParentBlock(pointer);
		let layoutDirection = "column" as LayoutDirection;
		let index = parentBlock?.children.length || 0;

		while (parentBlock && !parentBlock.canHaveChildren()) {
			parentBlock = parentBlock.getParentBlock();
		}

		if (parentBlock) {
			const parentElement = getBlockElement(parentBlock);
			layoutDirection = getLayoutDirection(getComputedStyleFor(parentElement));
			index = findDropIndex(pointer, parentElement, layoutDirection);
		}

		return { parentBlock, index, layoutDirection };
	};

	const findDropIndex = (
		pointer: DropPointer,
		parentElement: HTMLElement,
		layoutDirection: LayoutDirection,
	): number => {
		const childElements = Array.from(
			parentElement.querySelectorAll(":scope > .__builder_component__, #placeholder"),
		) as HTMLElement[];
		if (childElements.length === 0) return 0;

		const mousePos = layoutDirection === "row" ? pointer.clientX : pointer.clientY;
		let closestIndex = 0;
		let closestMidPoint = 0;
		let minDistance = Infinity;

		childElements.forEach((child, index) => {
			const rect = getElementRectInEditor(child);
			const midPoint = layoutDirection === "row" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
			const distance = Math.abs(midPoint - mousePos);
			if (distance < minDistance) {
				minDistance = distance;
				closestIndex = index;
				closestMidPoint = midPoint;
			}
		});

		// Determine if we should insert before or after the closest child
		// if mouse is closer to left/top side of the child, insert before, else after
		return mousePos <= closestMidPoint ? closestIndex : closestIndex + 1;
	};

	const updateDropTarget = (
		pointer: DropPointer,
		parentBlock: Block | null,
		index: number,
		layoutDirection: LayoutDirection,
	) => {
		let placeholder = canvasStore.dropTarget.placeholder;
		if (!placeholder) {
			// File drops don't trigger dragstart so placeholder is never inserted, insert explicitly if not found
			canvasStore.isDragging = true;
			canvasStore.insertDropPlaceholder();
			placeholder = canvasStore.dropTarget.placeholder;
		}

		if (!parentBlock || !placeholder) return;
		const newParent = getBlockElement(parentBlock);
		if (!newParent) return;

		if (
			canvasStore.dropTarget.parentBlock?.blockId === parentBlock.blockId &&
			canvasStore.dropTarget.index === index
		)
			return;

		placeholder.classList.toggle("vertical-placeholder", layoutDirection === "row");
		placeholder.classList.toggle("horizontal-placeholder", layoutDirection === "column");

		// add the placeholder to the new parent
		// exclude placeholder as its going to move with this update
		const children = Array.from(newParent.children).filter((child) => child.id !== "placeholder");
		if (index >= children.length) {
			newParent.appendChild(placeholder);
		} else {
			newParent.insertBefore(placeholder, children[index]);
		}

		canvasStore.dropTarget.parentBlock = parentBlock;
		canvasStore.dropTarget.index = index;
		canvasStore.dropTarget.x = pointer.x;
		canvasStore.dropTarget.y = pointer.y;
	};

	const handleBlockDrop = async (ev: DragEvent) => {
		let { parentBlock, index } = canvasStore.dropTarget;
		const componentName = ev.dataTransfer?.getData("componentName");
		const blockTemplate = ev.dataTransfer?.getData("blockTemplate");

		if (componentName) {
			await componentStore.loadComponent(componentName);
			const component = componentStore.componentMap.get(componentName) as Block;
			const newBlock = getBlockCopy(component);
			newBlock.extendFromComponent(componentName);
			await componentStore.pinComponentInstance(newBlock, componentName);
			// if shift key is pressed, replace parent block with new block
			if (ev.shiftKey) {
				if (!parentBlock) return;
				const parentParentBlock = parentBlock.getParentBlock();
				if (!parentParentBlock) return;
				parentParentBlock.replaceChild(parentBlock, newBlock);
			} else {
				if (!parentBlock) return;
				parentBlock.addChild(newBlock, index);
			}
			ev.stopPropagation();
			capture("builder_component_used");
		} else if (blockTemplate) {
			await blockTemplateStore.fetchBlockTemplate(blockTemplate);
			const newBlock = getBlockInstance(blockTemplateStore.getBlockTemplate(blockTemplate).block, false);
			// if shift key is pressed, replace parent block with new block
			if (ev.shiftKey) {
				parentBlock = getBlockToReplace(getInitialParentBlock(getDropPointer(ev)));
				if (!parentBlock) return;
				const parentParentBlock = parentBlock.getParentBlock();
				if (!parentParentBlock) return;
				const index = parentParentBlock.children.indexOf(parentBlock);
				parentParentBlock.children.splice(index, 1, newBlock);
			} else {
				if (!parentBlock) return;
				parentBlock.addChild(newBlock, index);
			}
			capture("builder_block_template_used", { template: blockTemplate });
		}
	};

	const handleFileDrop = (files: File[], ev: DragEvent) => {
		let { parentBlock, index } = canvasStore.dropTarget;
		const file = files[0];

		// Handle font files separately
		if (file.name.match(/\.(woff2?|ttf|otf|eot)$/)) {
			handleFontFileDrop(file);
			return;
		}

		uploadBuilderAsset(file).then((fileDoc: { fileURL: string; fileName: string }) => {
			if (!parentBlock) return;

			if (fileDoc.fileName.match(/\.(mp4|webm|ogg|mov)$/)) {
				if (parentBlock.isVideo()) {
					parentBlock.setAttribute("src", fileDoc.fileURL);
				} else {
					parentBlock.addChild(getVideoBlock(fileDoc.fileURL), index);
				}
				capture("builder_video_uploaded");
				return;
			}

			if (parentBlock.isImage() && files[0].type.startsWith("image/")) {
				parentBlock.setAttribute("src", fileDoc.fileURL);
				capture("builder_image_uploaded", {
					type: "image-replace",
				});
			} else if (parentBlock.isSVG()) {
				const imageBlock = getImageBlock(fileDoc.fileURL, fileDoc.fileName);
				const parentParentBlock = parentBlock.getParentBlock();
				parentParentBlock?.replaceChild(parentBlock, getBlockInstance(imageBlock));
				capture("builder_image_uploaded", {
					type: "svg-replace",
				});
			} else if (parentBlock.isContainer() && ev.shiftKey) {
				parentBlock.setStyle("background", `url(${fileDoc.fileURL})`);
				capture("builder_image_uploaded", {
					type: "background",
				});
			} else {
				parentBlock.addChild(getImageBlock(fileDoc.fileURL, fileDoc.fileName), index);
				capture("builder_image_uploaded", {
					type: "new-image",
				});
			}
		});
	};

	const handleFontFileDrop = async (file: File) => {
		const result = await uploadUserFont(file, { confirmBeforeUpload: true });
		if (result && blockController.isBlockSelected()) {
			blockController.setFontFamily(result.fontName);
		}
		if (result?.uploaded) {
			capture("builder_font_uploaded");
		}
	};

	return { isOverDropZone };
}
