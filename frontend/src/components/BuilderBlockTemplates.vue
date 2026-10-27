<template>
	<div class="flex flex-col">
		<CollapsibleSection class="order-1" :sectionName="section.sectionName" v-for="section in sections">
			<div class="grid auto-rows-[90px] grid-cols-2 gap-4">
				<div
					v-for="blockTemplate in section.blocks"
					:key="blockTemplate.name"
					class="flex"
					:class="{
						'col-span-2': blockTemplate?.preview_width === 2,
						'row-span-2': blockTemplate?.preview_height === 2,
					}">
					<div
						class="relative flex h-full w-full translate-x-0 translate-y-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden truncate rounded-5 border border-transparent bg-surface-gray-1 p-2 pt-3"
						draggable="true"
						@click="selectBlockTemplate(blockTemplate)"
						@dblclick="
							is_developer_mode &&
								!blockTemplate.isItem &&
								blockTemplateStore.editBlockTemplate(blockTemplate.name)
						"
						@dragstart="(ev) => setBlockTemplateData(ev, blockTemplate)"
						@dragend="() => canvasStore.handleDragEnd()">
						<div
							class="flex h-4/5 items-center justify-center"
							:class="{
								'w-14': !blockTemplate?.preview_width || blockTemplate?.preview_width == 1,
							}">
							<img
								v-if="blockTemplate.preview"
								:src="blockTemplate.preview"
								alt=""
								class="pointer-events-none" />
							<component v-else :is="blockTemplate.icon" class="pointer-events-none size-6 text-ink-gray-6" />
						</div>
						<p class="text-wrap text-center text-sm text-ink-gray-6">
							{{ blockTemplate.template_name }}
						</p>
					</div>
				</div>
			</div>
		</CollapsibleSection>
		<div v-show="blockTemplates.length > 10 || blockTemplateFilter" class="sticky top-0 bg-surface-base py-3">
			<BuilderInput
				type="text"
				:placeholder="__('Search Template')"
				v-model="blockTemplateFilter"
				@input="
					(value: string) => {
						blockTemplateFilter = value;
					}
				" />
		</div>
	</div>
</template>
<script setup lang="ts">
import { __ } from "@/translation";
import builderBlockTemplate from "@/data/builderBlockTemplate";
import useBlockTemplateStore from "@/stores/blockTemplateStore";
import useCanvasStore from "@/stores/canvasStore";
import { BlockTemplate } from "@/types/doctypes";
import { computed, onMounted, ref, type Component } from "vue";
import { blockTemplates as blockTemplateItems } from "./BlockTemplates";
import CollapsibleSection from "./CollapsibleSection.vue";

type BlockTemplateTile = Pick<BlockTemplate, "name" | "template_name"> &
	Partial<Pick<BlockTemplate, "preview" | "preview_width" | "preview_height">> & {
		category: string;
		icon?: Component;
		isItem?: boolean;
	};

const canvasStore = useCanvasStore();
const blockTemplateStore = useBlockTemplateStore();
const is_developer_mode = window.is_developer_mode;
const blockTemplateFilter = ref("");

onMounted(() => {
	builderBlockTemplate.fetch();
});

const itemTiles = computed(() =>
	blockTemplateItems.visible.value.map(
		(item): BlockTemplateTile => ({
			name: item.name,
			template_name: item.label,
			category: item.category,
			icon: item.icon,
			isItem: true,
		}),
	),
);

const blockTemplates = computed(() => {
	const filter = blockTemplateFilter.value.toLowerCase();
	return [...(builderBlockTemplate.data || []), ...itemTiles.value].filter((d: BlockTemplateTile) =>
		[d.name, d.template_name].some((text) => text?.toLowerCase().includes(filter)),
	);
});

const setBlockTemplateData = (ev: DragEvent, blockTemplate: BlockTemplateTile) => {
	ev.dataTransfer?.setData(blockTemplate.isItem ? "blockTemplateItem" : "blockTemplate", blockTemplate.name);
	canvasStore.handleDragStart(ev);
};

const selectedBlockTemplate = ref<string | null>(null);
const selectBlockTemplate = (blockTemplate: BlockTemplateTile) => {
	selectedBlockTemplate.value = blockTemplate.name;
	if (is_developer_mode && !blockTemplate.isItem && canvasStore.fragmentData.fragmentId) {
		blockTemplateStore.editBlockTemplate(blockTemplate.name);
	}
};

const getFilteredBlockTemplates = (section: string) => {
	return blockTemplates.value.filter((d: BlockTemplateTile) => d.category === section);
};

const sections = computed(() => {
	const builtIn = blockTemplateStore.blockTemplateCategoryOptions as string[];
	const categories = [...new Set([...builtIn, ...itemTiles.value.map((tile) => tile.category)])];
	return categories
		.map((category) => {
			return {
				sectionName: __(category),
				blocks: getFilteredBlockTemplates(category),
			};
		})
		.filter((section) => section.blocks.length > 0);
});
</script>
