<template>
	<div class="flex h-full min-h-0 flex-col bg-surface-base text-ink-gray-8">
		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
			<section class="rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-sm font-semibold text-ink-gray-9">Selection</p>
						<p class="mt-1 text-p-sm text-ink-gray-6">{{ selectionSummary }}</p>
					</div>
					<span class="rounded bg-surface-gray-3 px-2 py-1 text-p-xs text-ink-gray-7">
						{{ context.selection.count }}
					</span>
				</div>

				<div v-if="context.selection.blockIds.length" class="mt-3 space-y-1">
					<p
						v-for="blockId in context.selection.blockIds"
						:key="blockId"
						class="truncate rounded bg-surface-base px-2 py-1 font-mono text-p-xs text-ink-gray-6">
						{{ blockId }}
					</p>
				</div>

				<div v-if="selectionKinds.length" class="mt-3 flex flex-wrap gap-1">
					<span
						v-for="kind in selectionKinds"
						:key="kind"
						class="rounded bg-blue-100 px-2 py-1 text-p-xs text-blue-700">
						{{ kind }}
					</span>
				</div>
			</section>

			<section class="rounded-lg border border-outline-gray-2 p-3">
				<p class="mb-2 text-sm font-semibold text-ink-gray-9">Editor</p>
				<ContextRow label="Breakpoint" :value="context.breakpoint" />
				<ContextRow label="Editing mode" :value="context.editingMode" />
				<ContextRow label="Read only" :value="yesNo(context.readOnly)" />
				<ContextRow label="AI enabled" :value="yesNo(context.isAIEnabled)" />
			</section>

			<section class="rounded-lg border border-outline-gray-2 p-3">
				<p class="mb-2 text-sm font-semibold text-ink-gray-9">Page and site</p>
				<ContextRow label="Route" :value="context.page?.route ?? 'No page open'" />
				<ContextRow label="Published" :value="yesNo(context.page?.published)" />
				<ContextRow label="Template" :value="yesNo(context.page?.isTemplate)" />
				<ContextRow label="Standard" :value="yesNo(context.page?.isStandard)" />
				<ContextRow label="Developer mode" :value="yesNo(context.site.isDeveloperMode)" />
				<ContextRow label="Frappe Cloud" :value="yesNo(context.site.isFCSite)" />
			</section>

			<details class="rounded-lg border border-outline-gray-2 p-3">
				<summary class="cursor-pointer text-sm font-semibold text-ink-gray-9">Raw context</summary>
				<pre class="mt-3 overflow-auto whitespace-pre-wrap text-p-xs text-ink-gray-6">{{ rawContext }}</pre>
			</details>
		</div>

		<div class="border-t border-outline-gray-2 p-4">
			<p v-if="disabledReason" class="mb-2 text-p-xs text-ink-gray-5">{{ disabledReason }}</p>
			<p v-else-if="errorMessage" class="mb-2 text-p-xs text-red-600">{{ errorMessage }}</p>
			<Button
				class="w-full"
				label="Add Builder icon"
				:disabled="Boolean(disabledReason)"
				:loading="isAdding"
				@click="addBuilderIcon" />
		</div>
	</div>
</template>

<script setup lang="ts">
import builder from "frappe-builder-extension-sdk";
import { useBuilderContext } from "frappe-builder-extension-sdk/vue";
import { Button } from "frappe-ui";
import { computed, defineComponent, h, ref } from "vue";
import builderIcon from "./icon.svg?raw";

const ContextRow = defineComponent({
	props: { label: { type: String, required: true }, value: { type: String, required: true } },
	setup: (props) => () =>
		h("div", { class: "flex items-start justify-between gap-4 py-1 text-p-sm" }, [
			h("span", { class: "text-ink-gray-5" }, props.label),
			h("span", { class: "break-all text-right text-ink-gray-8" }, props.value),
		]),
});

const context = useBuilderContext([
	"selection",
	"breakpoint",
	"editingMode",
	"readOnly",
	"isAIEnabled",
	"page",
	"site",
]);
const isAdding = ref(false);
const errorMessage = ref("");

const yesNo = (value: boolean | undefined) => (value ? "Yes" : "No");
const selectionSummary = computed(() => {
	if (context.selection.count === 0) return "Select a block to add the icon inside it.";
	if (context.selection.count > 1) return context.selection.count + " blocks selected.";
	return context.selection.element ? "<" + context.selection.element + "> selected" : "One block selected";
});

const kindLabels: Array<[keyof typeof context.selection, string]> = [
	["isRoot", "Root"],
	["isText", "Text"],
	["isImage", "Image"],
	["isHTML", "HTML"],
	["isSVG", "SVG"],
	["isLink", "Link"],
	["isContainer", "Container"],
	["isVideo", "Video"],
	["isInput", "Input"],
	["isRepeater", "Repeater"],
	["isComponent", "Component"],
	["isChildOfComponent", "Component child"],
];
const selectionKinds = computed(() =>
	kindLabels.filter(([field]) => context.selection[field]).map(([, label]) => label),
);

const disabledReason = computed(() => {
	if (context.readOnly) return "The page is read only.";
	if (context.selection.count === 0) return "Select one block first.";
	if (context.selection.count > 1) return "Select only one block.";
	if (!context.selection.blockId) return "The selected block is unavailable.";
	return "";
});

const rawContext = computed(() =>
	JSON.stringify(
		{
			selection: { ...context.selection },
			breakpoint: context.breakpoint,
			editingMode: context.editingMode,
			readOnly: context.readOnly,
			isAIEnabled: context.isAIEnabled,
			page: context.page,
			site: context.site,
		},
		null,
		2,
	),
);

const addBuilderIcon = async () => {
	if (disabledReason.value || !context.selection.blockId) return;

	isAdding.value = true;
	errorMessage.value = "";
	try {
		await builder.block.insert(context.selection.blockId, {
			element: "div",
			attributes: { "aria-label": "Builder icon" },
			styles: { display: "inline-flex", width: "32px", height: "32px" },
			innerHTML: builderIcon,
		});
		await builder.ui.toast("Builder icon added as the last child.", { type: "success" });
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : "Could not add the Builder icon.";
	} finally {
		isAdding.value = false;
	}
};
</script>
