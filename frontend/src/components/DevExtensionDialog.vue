<template>
	<!-- one field and two buttons: the default "lg" is far wider than it needs -->
	<Dialog v-model="showDevExtensionDialog" size="sm" bare>
		<template #default>
			<div class="bg-surface-modal p-5">
				<DialogTitle as="h3" class="text-md-semibold text-ink-gray-9">Load dev extension</DialogTitle>
				<DialogDescription as="p" class="pt-4 text-p-sm text-ink-gray-6">
					Enter the URL of your dev server. The extension stays until you reload the page.
				</DialogDescription>

				<FormControl
					v-model="url"
					class="pt-4"
					type="text"
					placeholder="http://localhost:5173"
					autofocus
					@keyup.enter="load" />

				<p v-if="error" class="pt-2 text-p-sm text-ink-red-6">{{ error }}</p>

				<div class="flex justify-end gap-2 pt-4">
					<Button variant="subtle" @click="showDevExtensionDialog = false">Cancel</Button>
					<Button variant="solid" :loading="loading" @click="load">Load</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import { loadExtensions } from "@/data/extensions";
import { lastDevUrl, loadDevExtension, showDevExtensionDialog } from "@/extensions/devExtension";
import { Button, FormControl, toast } from "frappe-ui";
import { ref, watch } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";

const url = ref(lastDevUrl());
const error = ref("");
const loading = ref(false);

// the field is prefilled every time it opens, so a reload costs one click
watch(showDevExtensionDialog, (open) => {
	if (!open) return;
	url.value = lastDevUrl();
	error.value = "";
});

const load = async () => {
	loading.value = true;
	error.value = "";
	try {
		const extension = await loadDevExtension(url.value);
		// the panel opens the record the load just made, so the list has to name it
		await loadExtensions();
		showDevExtensionDialog.value = false;
		toast.success(`Loaded ${extension.label}`, {
			description: extension.capabilities.length
				? `Permissions: ${extension.capabilities.join(", ")}`
				: "It needs no permissions",
		});
	} catch (thrown) {
		error.value = (thrown as Error).message;
	} finally {
		loading.value = false;
	}
};
</script>
