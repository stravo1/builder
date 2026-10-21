<template>
	<div ref="panel" class="flex flex-col gap-4">
		<div v-if="propertyRows.length" class="mt-1 flex flex-col gap-4">
			<div
				v-for="row in propertyRows"
				:key="row.property"
				class="flex items-start"
				@contextmenu="showRemoveContextMenu($event, row.property)">
				<StylePropertyControl
					class="min-w-0 flex-1"
					v-bind="row.controlProps"
					:propertyKey="row.styleProperty"
					:label="row.label"
					:isCustomStyle="row.isCustomStyle"
					:getControlAttrs="() => row.controlAttrs" />
			</div>
		</div>
		<ContextMenu ref="contextMenu" :options="contextMenuOptions" />

		<Combobox
			ref="propertyCombobox"
			:options="propertyOptions"
			:placeholder="__('Add CSS property')"
			:empty-text="__('No matching properties')"
			open-on-focus
			@paste="pasteStyles"
			@update:query="propertySearch = $event"
			@update:modelValue="addProperty">
			<template #suffix>
				<span />
			</template>
			<template #item-label="{ item }">
				<span class="flex min-w-0 flex-col gap-0.5">
					<span class="truncate text-sm text-ink-gray-8">
						{{ toTitleCase(item.value) }}
					</span>
					<code class="truncate font-mono text-xs text-ink-gray-5">
						{{ item.value }}
					</code>
				</span>
			</template>
			<template #item-add-property="{ query }">
				<span class="flex min-w-0 items-center gap-2">
					<span class="min-w-0 truncate text-sm text-ink-gray-8">
						{{ __("Add") }}
						<code class="font-mono text-xs text-ink-gray-6">{{ query }}</code>
					</span>
				</span>
			</template>
		</Combobox>
	</div>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import ContextMenu from "@/components/ContextMenu.vue";
import Autocomplete from "@/components/Controls/Autocomplete.vue";
import StylePropertyControl from "@/components/Controls/StylePropertyControl.vue";
import useCanvasStore from "@/stores/canvasStore";
import blockController from "@/utils/blockController";
import {
	getCSSPropertyControl,
	getCSSPropertyOptions,
	getCSSValueOptions,
	isValidCSSPropertyName,
	type StyleControlConfig,
} from "@/utils/cssMetadata";
import {
	getCustomStyleProperties,
	getStylePropertiesWithoutControls,
	isStylePropertyWithControls,
} from "@/utils/stylePropertiesWithControls";
import {
	isInteractiveControl,
	normalizeCSSPropertyName,
	stripStatePrefix,
	toCSSProperty,
	toStyleProperty,
	toTitleCase,
} from "@/utils/helpers";
import { getStylesFromText } from "@/utils/styleText";
import { Combobox, type ComboboxOptionValue, type SelectionExposed } from "frappe-ui";
import { computed, nextTick, reactive, ref, watch } from "vue";

const STATES = ["hover", "active", "focus"];

const canvasStore = useCanvasStore();
const propertySearch = ref("");
const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null);
const contextMenuProperty = ref<string | null>(null);
const propertyCombobox = ref<SelectionExposed | null>(null);
const panel = ref<HTMLElement | null>(null);

// rows added from the picker stay visible until they are removed, even without a value
const addedProperties = reactive(new Set<string>());

const selectedBlock = computed(() => blockController.getFirstSelectedBlock());

watch(
	() => selectedBlock.value?.blockId,
	() => addedProperties.clear(),
);

// styles that apply at the active breakpoint, including the ones it inherits
const cascadingStyles = computed(() => {
	const block = selectedBlock.value;
	if (!block) return {};
	return block.getStyles(canvasStore.activeCanvas?.activeBreakpoint || "desktop");
});

const activeProperties = computed(() => {
	const properties = getStylePropertiesWithoutControls(cascadingStyles.value);
	if (selectedBlock.value)
		getCustomStyleProperties(selectedBlock.value).forEach((property) => properties.add(property));
	addedProperties.forEach((property) => properties.add(property));
	return properties;
});

// keyword suggestions are only meaningful on the fallback Autocomplete control
const getControlAttrs = (property: string, { component, controlAttrs }: StyleControlConfig) => {
	if (component && component !== Autocomplete) return controlAttrs || {};
	return {
		...controlAttrs,
		getOptions: (query: string) => getCSSValueOptions(property, query),
		showInputAsOption: true,
		allowArbitraryValue: true,
	};
};

const propertyRows = computed(() =>
	Array.from(activeProperties.value)
		.sort()
		.map((property) => {
			const isCustomStyle = isStylePropertyWithControls(property);
			// a custom style skips the inferred control, which validates values the way the built-in one does
			const { controlAttrs, options, component, ...controlProps } = isCustomStyle
				? ({} as StyleControlConfig)
				: getCSSPropertyControl(property);
			return {
				property,
				styleProperty: String(toStyleProperty(property)),
				isCustomStyle,
				label: toTitleCase(property),
				controlProps: {
					...controlProps,
					component: component || Autocomplete,
					options: options?.length ? options : undefined,
				},
				controlAttrs: getControlAttrs(property, { component, controlAttrs }),
			};
		}),
);

const canAddProperty = (property: string | null | undefined) => {
	const normalizedProperty = normalizeCSSPropertyName(property);
	return isValidCSSPropertyName(normalizedProperty) && !activeProperties.value.has(normalizedProperty);
};

const normalizedPropertySearch = computed(() => normalizeCSSPropertyName(propertySearch.value));

const searchablePropertyOptions = computed(() =>
	getCSSPropertyOptions(propertySearch.value)
		.filter((option) => !activeProperties.value.has(option.value))
		.map((option) => ({
			...option,
			label: normalizedPropertySearch.value
				? `${option.label} ${normalizedPropertySearch.value}`
				: option.label,
		})),
);

const propertyOptions = computed(() => [
	...searchablePropertyOptions.value,
	{
		type: "custom" as const,
		key: "add-property",
		label: __("Add Property"),
		slot: "add-property",
		condition: ({ query }: { query: string }) => canAddProperty(query),
		onClick: ({ query }: { query: string }) => addProperty(query),
	},
]);

const focusProperty = async (property: string) => {
	await nextTick();
	const selector = `[data-property="${String(toStyleProperty(property))}"]`;
	// a built-in control earlier on the page can share the data-property
	const row = panel.value?.querySelector(selector) as HTMLElement | null;
	row?.scrollIntoView({ block: "nearest" });
	row?.querySelector("input")?.focus();
};

const resetPropertyPicker = () => {
	propertySearch.value = "";
	nextTick(() => propertyCombobox.value?.clear());
};

const addProperty = (property: ComboboxOptionValue | null | undefined) => {
	const normalizedProperty = normalizeCSSPropertyName(property?.toString());
	if (normalizedProperty && canAddProperty(normalizedProperty)) {
		addedProperties.add(normalizedProperty);
		focusProperty(normalizedProperty);
	}
	resetPropertyPicker();
};

// a property with a built-in control keeps that value and gets a custom style at the active breakpoint
const getStyleSetter = (property: string) =>
	isStylePropertyWithControls(property) ? blockController.setCustomStyle : blockController.setStyle;

// pasting "color: red; hover:color: blue" or a style object into the picker sets every declaration
const pasteStyles = (event: ClipboardEvent) => {
	const styles = Object.entries(getStylesFromText(event.clipboardData?.getData("text/plain") || ""))
		.map(([style, value]) => ({ style: toCSSProperty(style), value }))
		.filter(({ style }) => isValidCSSPropertyName(stripStatePrefix(style)));
	if (!styles.length) return;
	event.preventDefault();
	styles.forEach(({ style, value }) =>
		getStyleSetter(stripStatePrefix(style))(toStyleProperty(style), value),
	);
	resetPropertyPicker();
};

const removeProperty = (property: string) => {
	addedProperties.delete(property);
	const setStyle = getStyleSetter(property);
	setStyle(toStyleProperty(property), null);
	STATES.forEach((state) => setStyle(toStyleProperty(`${state}:${property}`), null));
	resetPropertyPicker();
};

const contextMenuOptions = [
	{
		label: __("Remove"),
		action: () => contextMenuProperty.value && removeProperty(contextMenuProperty.value),
	},
];

const showRemoveContextMenu = (event: MouseEvent, property: string) => {
	if (isInteractiveControl(event.target)) return;
	contextMenuProperty.value = property;
	contextMenu.value?.show(event);
};
</script>
