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
				<div class="text-sm text-ink-gray-8">Object Items:</div>
				<ObjectEditor
					:obj
					:disabled
					:isRowKeyInputDisabled
					:isRowValueInputDisabled
					:isRowRemoveButtonDisabled
					:disableAddButton
					@update:obj="updateModelValue" />
			</div>
		</template>
	</Popover>
</template>

<script setup lang="ts">
import { Popover } from "frappe-ui";
import { computed, ref } from "vue";
import InputLabel from "./Controls/InputLabel.vue";
import ObjectEditor from "./ObjectEditor.vue";

type ObjectEditorRow = {
	key: string;
	value: string;
	index: number;
	obj: Record<string, string>;
};

type RowDisabledResolver = boolean | ((row: ObjectEditorRow) => boolean);

const props = defineProps<{
	label: string;
	getModelValue: () => string;
	setModelValue: (value: string) => void;
	disabled?: boolean;
	isRowKeyInputDisabled?: RowDisabledResolver;
	isRowValueInputDisabled?: RowDisabledResolver;
	isRowRemoveButtonDisabled?: RowDisabledResolver;
	disableAddButton?: boolean;
}>();

const emit = defineEmits({
	"update:modelValue": (value: string) => true,
});

const getPassedObject = () => {
	try {
		const value = props.getModelValue();
		const parsed = JSON.parse(value);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed;
		}
		return {};
	} catch {
		return {};
	}
};

const obj = ref<Record<string, string>>(getPassedObject());

const isTriggerDisabled = computed(() => props.disabled);

const updateModelValue = (value: Record<string, string>) => {
	if (props.disabled) return;
	obj.value = value;
	props.setModelValue(JSON.stringify(value));
	emit("update:modelValue", JSON.stringify(value));
};
</script>
