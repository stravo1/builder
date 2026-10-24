<template>
	<div class="flex min-h-36 flex-col justify-between gap-2">
		<div class="flex flex-col gap-2">
			<BuilderInput
				v-if="itemCount > 5"
				v-model="searchQuery"
				@input="(val: string) => (searchQuery = val)"
				type="text"
				:placeholder="__('Search...')" />
			<div class="no-scrollbar max-h-80 overflow-y-auto">
				<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
					<li v-if="selectedItem?.key && !shownItems.some((item) => isSameItem(item, selectedItem!))">
						<DynamicValueRow
							:item="selectedItem"
							:value="getValue(selectedItem)"
							selected
							@click.stop="selectAndSetItem(selectedItem)" />
					</li>
					<template v-for="section in sections" :key="section.name">
						<li v-if="section.label" class="px-2 pb-1 pt-3 text-xs font-medium text-ink-gray-5 first:pt-1">
							{{ section.label }}
						</li>
						<li v-for="item in section.items" :key="`${item.comesFrom}:${item.key}`">
							<DynamicValueRow
								:item="item"
								:value="getValue(item)"
								:selected="Boolean(selectedItem && isSameItem(item, selectedItem))"
								@click.stop="selectAndSetItem(item)" />
						</li>
					</template>
					<li
						v-if="shownItems.length === 0 && !selectedItem?.key"
						class="flex flex-col items-center justify-center p-10 text-center text-sm text-ink-gray-5">
						<div>
							{{ __("No dynamic values found. Please add using") }}
							<a
								href="#"
								@click="builderStore.showDataScriptDialog = 'page'"
								class="text-ink-gray-5 underline hover:text-ink-gray-7">
								{{ __("Page Data Script") }}
							</a>
							.
						</div>
					</li>
				</ul>
			</div>
		</div>
		<div
			class="-mx-3 border-t border-outline-gray-1 px-3 pt-2"
			v-if="shownItems.length !== 0 && builderStore.leftPanelActiveTab !== 'Code'">
			<Button
				variant="ghost"
				icon-left="lucide-code"
				:label="__('Open Code Tab')"
				@click="builderStore.leftPanelActiveTab = 'Code'" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import Block from "@/block";
import useBuilderStore from "@/stores/builderStore";
import usePageStore from "@/stores/pageStore";
import blockController from "@/utils/blockController";
import {
	getDataArray,
	getDefaultPropsList,
	getParentProps,
	getPropValue,
	getRepeaterScopedData,
} from "@/utils/helpers";
import { computed, ref } from "vue";
import DynamicValueRow from "./DynamicValueRow.vue";
import useCanvasStore from "@/stores/canvasStore.js";
import componentController from "@/utils/componentController.js";
import {
	isSameItem,
	withoutGroupedItems,
	type DynamicValueItem,
	type LoadedDynamicValueGroup,
} from "@/components/DynamicValueGroups";

const pageStore = usePageStore();
const builderStore = useBuilderStore();
const canvasStore = useCanvasStore();

type DynamicValueFilterOptions = {
	excludePassedDownProps?: boolean;
	excludeOwnProps?: boolean;
};

const props = defineProps<{
	selectedValue?: DynamicValueItem;
	block?: Block;
	options?: DynamicValueFilterOptions;
	groups: LoadedDynamicValueGroup[];
}>();

const emit = defineEmits(["setDynamicValue"]);
const searchQuery = ref("");

const currentBlock = computed(() => {
	return props.block || blockController.getFirstSelectedBlock();
});

// Page Data Array maybe not be allowed in fragment mode
const pageDataArray = computed(() => {
	if (canvasStore.editingMode == "fragment") return [];
	return getDataArray(getRepeaterScopedData(currentBlock.value, pageStore.pageData));
});

const defaultProps = computed(() => {
	return getDefaultPropsList(currentBlock.value!);
});

const componentData = computed(() => {
	return componentController.getComponentDataPreview();
});

const componentDataArray = computed(() => {
	return getDataArray(getRepeaterScopedData(currentBlock.value, componentData.value, "componentData"));
});

const filteredBlockProps = computed(() => {
	let ownBlockProps: string[];
	if (props.options?.excludeOwnProps) {
		ownBlockProps = [];
	} else {
		ownBlockProps = Object.keys(currentBlock.value?.getBlockProps() || {});
	}
	let parentProps: string[];
	if (props.options?.excludePassedDownProps || !currentBlock.value) {
		parentProps = [];
	} else {
		parentProps = Object.keys(getParentProps(currentBlock.value));
	}
	const combinedProps = [...ownBlockProps, ...parentProps].reduce((acc, prop) => {
		if (!acc.find((p: string) => p === prop)) {
			acc.push(prop);
		}
		return acc;
	}, [] as string[]);
	return combinedProps;
});

const builtInItems = computed(() => {
	const pageDataArrayItems = pageDataArray.value.map((item) => ({ key: item, comesFrom: "dataScript" }));
	const componentDataArrayItems = componentDataArray.value.map((item) => ({
		key: item,
		comesFrom: "componentData",
	}));
	const propItems = filteredBlockProps.value.map((item) => ({ key: item, comesFrom: "props" }));
	const defaultPropsKeys = Object.keys(defaultProps.value || {}).map((item) => ({
		key: item,
		comesFrom: "props",
	}));
	return [
		...pageDataArrayItems,
		...componentDataArrayItems,
		...propItems,
		...defaultPropsKeys,
	] as DynamicValueItem[];
});

const itemCount = computed(
	() => builtInItems.value.length + props.groups.reduce((count, group) => count + group.items.length, 0),
);

const matchesQuery = (item: DynamicValueItem) => {
	const query = searchQuery.value.toLowerCase();
	return [item.label, item.key, getValue(item)].some((text) =>
		String(text ?? "")
			.toLowerCase()
			.includes(query),
	);
};

const sections = computed(() =>
	[
		...props.groups,
		{
			name: "builder",
			label: props.groups.length ? __("Other Values") : "",
			items: withoutGroupedItems(builtInItems.value, props.groups),
		},
	]
		.map((section) => ({ ...section, items: section.items.filter(matchesQuery) }))
		.filter((section) => section.items.length),
);

const shownItems = computed(() => sections.value.flatMap((section) => section.items));

const selectedItem = ref<DynamicValueItem | null>(props.selectedValue || null);

const getValue = (item: DynamicValueItem): any => {
	if (item.comesFrom == "props") {
		return getPropValue(item.key, currentBlock.value, getDataScriptValue, defaultProps.value);
	} else if (item.comesFrom == "componentData") {
		return getComponentDataValue(item.key);
	} else {
		return getDataScriptValue(item.key);
	}
};

const getDataScriptValue = (path: string): any => {
	const collectionObject = getRepeaterScopedData(currentBlock.value, pageStore.pageData);
	return path.split(".").reduce((obj: Record<string, any>, key: string) => obj?.[key], collectionObject);
};

const getComponentDataValue = (path: string): any => {
	const collectionObject = getRepeaterScopedData(currentBlock.value, componentData.value, "componentData");
	return path.split(".").reduce((obj: Record<string, any>, key: string) => obj?.[key], collectionObject);
};

function selectAndSetItem(item: DynamicValueItem) {
	selectedItem.value = item;
	emit("setDynamicValue", item);
	selectedItem.value = null;
}
</script>
