<template>
	<div ref="arrayEditor" class="flex flex-col gap-2" @paste="pasteArray">
		<div v-for="(item, index) in arr" :key="index" class="flex gap-2">
			<BuilderInput
				placeholder="Enter value"
				:modelValue="item"
				:disabled="resolveRowItemInputDisabled(item, index)"
				@input="(val: string) => updateItem(index, val)" />
			<Button
				class="flex-shrink-0 text-xs"
				variant="subtle"
				icon="lucide-x"
				:disabled="resolveRowRemoveButtonDisabled(item, index)"
				@click="deleteItem(index)"></Button>
		</div>
		<Button variant="outline" class="w-full" label="Add" :disabled="isAddButtonDisabled" @click="addItem"></Button>
		<p class="rounded-sm bg-surface-gray-1 p-2 text-xs text-ink-gray-7" v-show="description">
			<span v-html="description"></span>
		</p>
	</div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

type ArrayEditorRow = {
	item: string;
	index: number;
	arr: Array<string>;
};

type RowDisabledResolver = boolean | ((row: ArrayEditorRow) => boolean);

const props = defineProps<{
	arr: Array<string>;
	description?: string;
	disabled?: boolean;
	isRowItemInputDisabled?: RowDisabledResolver;
	isRowRemoveButtonDisabled?: RowDisabledResolver;
	disableAddButton?: boolean;
}>();

const emit = defineEmits({
	"update:arr": (arr: Array<string>) => true,
});

const isAddButtonDisabled = computed(() => props.disabled || props.disableAddButton);

const resolveRowDisabled = (resolver: RowDisabledResolver | undefined, item: string, index: number) => {
	if (props.disabled) return true;
	if (typeof resolver === "function") return resolver({ item, index, arr: props.arr });
	return Boolean(resolver);
};

const resolveRowItemInputDisabled = (item: string, index: number) =>
	resolveRowDisabled(props.isRowItemInputDisabled, item, index);

const resolveRowRemoveButtonDisabled = (item: string, index: number) =>
	resolveRowDisabled(props.isRowRemoveButtonDisabled, item, index);

const addItem = async () => {
	if (isAddButtonDisabled.value) return;
	const newArr = [...props.arr, ""];
	emit("update:arr", newArr);
	await nextTick();
	const inputs = arrayEditor.value?.querySelectorAll("input");
	if (inputs) {
		const lastInput = inputs[inputs.length - 1];
		lastInput.focus();
	}
};

const updateItem = (index: number, value: string) => {
	if (resolveRowItemInputDisabled(props.arr[index], index)) return;
	const newArr = [...props.arr];
	newArr[index] = value;
	emit("update:arr", newArr);
};

const deleteItem = (index: number) => {
	if (resolveRowRemoveButtonDisabled(props.arr[index], index)) return;
	const newArr = [...props.arr];
	newArr.splice(index, 1);
	emit("update:arr", newArr);
};

const arrayEditor = ref<HTMLElement | null>(null);

const pasteArray = (e: ClipboardEvent) => {
	if (props.disabled || isAddButtonDisabled.value) return;
	const passedArr = props.arr.filter((item) => item.trim() !== "");
	const text = e.clipboardData?.getData("text/plain");
	if (text) {
		e.preventDefault();
		try {
			// Try to parse as JSON array first
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed)) {
				const stringArray = parsed.map((item) => String(item));
				emit("update:arr", [...passedArr, ...stringArray]);
				return;
			}
		} catch (e) {
			// If JSON parsing fails, try other formats
		}

		// Try to parse as comma-separated values
		if (text.includes(",")) {
			const items = text
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item);
			emit("update:arr", [...passedArr, ...items]);
			return;
		}

		// Try to parse as line-separated values
		if (text.includes("\n")) {
			const items = text
				.split("\n")
				.map((item) => item.trim())
				.filter((item) => item);
			emit("update:arr", [...passedArr, ...items]);
			return;
		}

		// Single item
		emit("update:arr", [...passedArr, text.trim()]);
	}
};
</script>
