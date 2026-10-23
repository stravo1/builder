<template>
	<!-- The install, or the first run of an app's extension, asks the manager to trust its code, and nothing else. -->
	<Dialog
		:modelValue="open"
		size="sm"
		bare
		@update:modelValue="(value: boolean) => emit('update:open', value)">
		<div class="bg-surface-elevation-2 p-5">
			<DialogTitle as="h3" class="text-md-semibold text-ink-gray-9">{{ action }} {{ label }}?</DialogTitle>
			<p class="pt-2 text-p-sm text-ink-gray-6">
				It runs inside the editor with the access of each user who opens it. It can read and change pages and
				site data that the user can. {{ action }} only extensions that you trust.
			</p>

			<div class="flex justify-end gap-2 pt-4">
				<Button variant="subtle" label="Cancel" @click="emit('update:open', false)" />
				<Button variant="solid" :label="action" @click="emit('confirm')" />
			</div>
		</div>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import { Button } from "frappe-ui";
import { DialogTitle } from "reka-ui";

defineProps<{ open: boolean; label: string; action: "Install" | "Enable" }>();

const emit = defineEmits<{ "update:open": [open: boolean]; confirm: [] }>();
</script>
