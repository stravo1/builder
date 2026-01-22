<template>
	<div>
		<draggable
			class="block-tree"
			:list="blocks"
			:group="{ name: 'block-tree' }"
			item-key="blockId"
			@add="updateParent"
			:disabled="disableDraggable || readonly">
			<template #item="{ element }">
				<div
					:data-block-layer-id="element.blockId"
					:title="element.blockId"
					class="min-w-24 cursor-pointer select-none rounded border border-transparent bg-surface-white bg-opacity-50 text-base text-ink-gray-7"
					@click.stop="selectBlock(element, $event)"
					@pointerdown.stop="handlePointerDown(element, $event)"
					@pointermove.stop="handlePointerMove($event)"
					@pointerup.stop="handlePointerUp($event)"
					@pointercancel.stop="handlePointerCancel($event)"
					@mouseover.stop="canvasStore.activeCanvas?.setHoveredBlock(element.blockId)"
					@mouseleave.stop="canvasStore.activeCanvas?.setHoveredBlock(null)">
					<span
						class="group my-[7px] flex items-center gap-1.5 pr-[2px] font-medium"
						:style="{ paddingLeft: `${indent}px` }"
						:class="{
							'!opacity-50': !element.isVisible() || isParentHidden,
						}">
						<div>
							<div class="scroll-into-view-anchor absolute ml-20"></div>
						</div>
						<FeatherIcon
							:name="isExpanded(element) ? 'chevron-down' : 'chevron-right'"
							class="h-3 w-3 text-ink-gray-4"
							:class="{
								'ml-[-18px]': adjustForRoot,
							}"
							v-if="element.children && element.children.length && !element.isRoot()"
							@click.stop="toggleExpanded(element)"
							@pointerdown.stop="handleExpandPointerDown(element, $event)" />
						<FeatherIcon
							:name="element.getIcon()"
							class="h-3 w-3"
							:class="{
								'text-purple-500 opacity-80 dark:opacity-100 dark:brightness-125 dark:saturate-[0.3]':
									element.isExtendedFromComponent(),
							}"
							v-if="!Boolean(element.extendedFromComponent)" />
						<BlocksIcon
							class="mr-1 h-3 w-3"
							:class="{
								'text-purple-500 opacity-80 dark:opacity-100 dark:brightness-125 dark:saturate-[0.3]':
									element.isExtendedFromComponent(),
							}"
							v-if="Boolean(element.extendedFromComponent)" />
						<span
							class="layer-label min-h-[1em] min-w-[2em] max-w-64 truncate"
							:contenteditable="element.editable && !readonly"
							:title="element.blockId"
							:class="{
								'text-purple-500 opacity-80 dark:opacity-100 dark:brightness-125 dark:saturate-[0.3]':
									element.isExtendedFromComponent(),
							}"
							@dblclick="
								(ev) => {
									if (!readonly) {
										element.editable = true;
										// focus
										const target = ev.target as HTMLElement;
										target.focus();
									}
								}
							"
							@keydown.enter.stop.prevent="element.editable = false"
							@blur="setBlockName($event, element)">
							{{ element.getBlockDescription() }}
						</span>
						<!-- toggle visibility -->
						<FeatherIcon
							v-if="!element.isRoot() && !isParentHidden && !readonly"
							:name="element.isVisible() ? 'eye' : 'eye-off'"
							class="invisible ml-auto mr-2 h-3 w-3 group-hover:visible"
							@click.stop="element.toggleVisibility()"
							@pointerdown.stop="handleVisibilityPointerDown(element, $event)" />
					</span>
					<div v-if="canShowChildLayer(element)">
						<BlockLayers
							:blocks="element.children"
							:ref="childLayer"
							:is-parent-hidden="isParentHidden || !element.isVisible()"
							:indent="childIndent"
							:readonly="readonly"
							:disable-draggable="
								Boolean(element.children.length && element.children[0].isChildOfComponentBlock())
							" />
					</div>
				</div>
			</template>
		</draggable>
	</div>
</template>
<script setup lang="ts">
import type Block from "@/block";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import blockController from "@/utils/blockController";
import { FeatherIcon } from "frappe-ui";
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import BlockLayers from "./BlockLayers.vue";
import BlocksIcon from "./Icons/Blocks.vue";

type LayerInstance = InstanceType<typeof BlockLayers>;

const canvasStore = useCanvasStore();
const builderStore = useBuilderStore();

// Long press state
const LONG_PRESS_DURATION = 500;
const LONG_PRESS_MOVE_THRESHOLD = 8;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressPointerId: number | null = null;
let longPressStartX = 0;
let longPressStartY = 0;
let longPressBlock: Block | null = null;
let longPressTriggered = false;

const clearPressTimer = () => {
	if (pressTimer) {
		clearTimeout(pressTimer);
		pressTimer = null;
	}
	longPressPointerId = null;
	longPressBlock = null;
};

const props = withDefaults(
	defineProps<{
		blocks: Block[];
		indent?: number;
		adjustForRoot?: boolean;
		disableDraggable?: boolean;
		isParentHidden?: boolean;
		readonly?: boolean;
	}>(),
	{
		blocks: () => [],
		indent: 0,
		adjustForRoot: true,
		disableDraggable: false,
		isParentHidden: false,
		readonly: false,
	},
);

interface LayerBlock extends Block {
	editable: boolean;
}

let childIndent = props.indent + 24;
if (!props.adjustForRoot) {
	childIndent = props.indent + 32;
}

const setBlockName = (ev: Event, block: LayerBlock) => {
	if (props.readonly) return;
	const target = ev.target as HTMLElement;
	block.blockName = target.innerText.trim();
	block.editable = false;
};

const expandedLayers = ref(new Set(["root"]));

const isExpanded = (block: Block) => {
	return expandedLayers.value.has(block.blockId);
};

// TODO: Refactor this!
const toggleExpanded = (block: Block) => {
	if (block.isRoot()) {
		return;
	}
	if (!blockExits(block)) {
		const child = childLayers.value.find((layer) => layer.blockExitsInTree(block)) as LayerInstance;
		if (child) {
			child.toggleExpanded(block);
		}
	}
	if (isExpanded(block)) {
		expandedLayers.value.delete(block.blockId);
	} else {
		expandedLayers.value.add(block.blockId);
	}
};

// @ts-ignore
const isExpandedInTree = (block: Block) => {
	if (!blockExits(block)) {
		const child = childLayers.value.find((layer) => layer.blockExitsInTree(block)) as LayerInstance;
		if (child) {
			return child.isExpandedInTree(block);
		}
	}
	return isExpanded(block);
};

const blockExits = (block: Block) => {
	return props.blocks.find((b) => b.blockId === block.blockId);
};

const canShowChildLayer = (block: Block) => {
	return (isExpanded(block) && block.hasChildren()) || (block.canHaveChildren() && !block.hasChildren());
};

watch(
	() => canvasStore.activeCanvas?.selectedBlockIds,
	() => {
		if (canvasStore.activeCanvas?.selectedBlocks.length) {
			canvasStore.activeCanvas?.selectedBlocks.forEach((block: Block) => {
				if (block) {
					let parentBlock = block.getParentBlock();
					// open all parent blocks
					while (parentBlock && !parentBlock.isRoot()) {
						expandedLayers.value.add(parentBlock?.blockId);
						parentBlock = parentBlock.getParentBlock();
					}
				}
			});
		}
	},
	{ immediate: true, deep: true },
);

// @ts-ignore
const updateParent = (event) => {
	event.item.__draggable_context.element.parentBlock = canvasStore.activeCanvas?.findBlock(
		event.to.closest("[data-block-layer-id]").dataset.blockLayerId,
	);
};

const blockExitsInTree = (block: Block) => {
	if (blockExits(block)) {
		return true;
	}
	for (const layer of childLayers.value) {
		if (layer.blockExitsInTree(block)) {
			return true;
		}
	}
	return false;
};

const selectBlock = (block: Block, event: MouseEvent | PointerEvent) => {
	canvasStore.selectBlock(block, event, false, true);
};

const handlePointerDown = (block: Block, event: PointerEvent) => {
	// Handle Apple Pencil / stylus selection explicitly
	if (event.pointerType === "pen") {
		event.preventDefault();
		selectBlock(block, event);
		return;
	}

	// Handle long press for touch
	if (event.pointerType === "touch" && event.isPrimary) {
		if (longPressPointerId !== null) return;

		longPressPointerId = event.pointerId;
		longPressStartX = event.clientX;
		longPressStartY = event.clientY;
		longPressBlock = block;
		longPressTriggered = false;

		pressTimer = setTimeout(() => {
			if (longPressBlock) {
				longPressTriggered = true;
				canvasStore.activeCanvas?.selectBlock(longPressBlock, blockController.multipleBlocksSelected());
				builderStore.blockContextMenu?.showContextMenu(event, longPressBlock);
			}
			pressTimer = null;
			longPressPointerId = null;
			longPressBlock = null;
		}, LONG_PRESS_DURATION);
	}
};

const handlePointerMove = (event: PointerEvent) => {
	if (longPressPointerId === null || event.pointerId !== longPressPointerId) return;
	const dx = event.clientX - longPressStartX;
	const dy = event.clientY - longPressStartY;
	if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) {
		clearPressTimer();
	}
};

const handlePointerUp = (event: PointerEvent) => {
	if (longPressPointerId === event.pointerId) {
		const block = longPressBlock;
		const wasLongPress = longPressTriggered;
		clearPressTimer();
		
		// If it was a simple tap (not a long press), select the block
		if (!wasLongPress && block && event.pointerType === "touch") {
			selectBlock(block, event);
		}
	}
};

const handlePointerCancel = (event: PointerEvent) => {
	if (longPressPointerId === event.pointerId) {
		clearPressTimer();
	}
};

const handleExpandPointerDown = (block: Block, event: PointerEvent) => {
	// Handle touch and pencil for expand/collapse icon
	if (event.pointerType === "touch" || event.pointerType === "pen") {
		event.preventDefault();
		event.stopPropagation();
		toggleExpanded(block);
	}
};

const handleVisibilityPointerDown = (block: Block, event: PointerEvent) => {
	// Handle touch and pencil for visibility icon
	if (event.pointerType === "touch" || event.pointerType === "pen") {
		event.preventDefault();
		event.stopPropagation();
		block.toggleVisibility();
	}
};

defineExpose({
	toggleExpanded,
	isExpandedInTree,
	blockExitsInTree,
});
</script>
<style>
.hovered-block {
	@apply border-blue-300 text-gray-700 dark:border-blue-900 dark:text-gray-500;
}
.block-selected {
	@apply border-blue-400 text-gray-900 dark:border-blue-700 dark:text-gray-200;
}
</style>
