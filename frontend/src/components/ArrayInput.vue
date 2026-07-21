<template>
	<Popover :offset="20" placement="left">
		<template #target="{ open }">
			<div class="relative flex w-full gap-2">
				<div class="flex w-[88px] shrink-0 items-center">
					<InputLabel class="truncate">
						{{ label }}
					</InputLabel>
				</div>
				<div class="relative w-full">
					<Button
						class="w-full"
						variant="subtle"
						icon="lucide-pencil"
						:disabled="isTriggerDisabled"
						@click.stop="!isTriggerDisabled && open()" />
				</div>
			</div>
		</template>
		<template #body>
			<div
				@click.stop
				@mousedown.stop
				class="flex max-h-60 w-60 flex-col gap-3 overflow-auto rounded-lg bg-surface-base p-4 shadow-lg">
				<div class="text-sm text-ink-gray-8">Array Items:</div>
				<ArrayEditor
					:arr
					:disabled
					:isRowItemInputDisabled
					:isRowRemoveButtonDisabled
					:disableAddButton
					@update:arr="updateModelValue" />
			</div>
		</template>
	</Popover>
</template>

<script setup lang="ts">
import { Popover } from "frappe-ui";
import { computed, ref } from "vue";
import ArrayEditor from "./ArrayEditor.vue";
import InputLabel from "./Controls/InputLabel.vue";

type ArrayEditorRow = {
	item: string;
	index: number;
	arr: Array<string>;
};

type RowDisabledResolver = boolean | ((row: ArrayEditorRow) => boolean);

const props = defineProps<{
	label: string;
	getModelValue: () => string;
	setModelValue: (value: string) => void;
	disabled?: boolean;
	isRowItemInputDisabled?: RowDisabledResolver;
	isRowRemoveButtonDisabled?: RowDisabledResolver;
	disableAddButton?: boolean;
}>();

const emit = defineEmits({
	"update:modelValue": (value: string) => true,
});

const getPassedArray = () => {
	try {
		const value = props.getModelValue();
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed;
		}
		return [];
	} catch {
		return [];
	}
};

const arr = ref<any[]>(getPassedArray());

const isTriggerDisabled = computed(() => props.disabled);

const updateModelValue = (value: string[]) => {
	if (props.disabled) return;
	arr.value = value;
	props.setModelValue(JSON.stringify(value));
	emit("update:modelValue", JSON.stringify(value));
};
</script>
