<template>
	<div class="flex flex-col gap-3 p-3">
		<p v-if="!installedExtensions.length" class="text-base italic text-ink-gray-5">
			No extensions installed
		</p>

		<div v-else class="flex flex-col">
			<ItemListRow v-for="extension in installedExtensions" :key="extension.name" size="md">
				<template #prefix>
					<!-- one box whatever the file measures, so a stray icon cannot set the row height -->
					<img
						v-if="extension.icon"
						:src="extension.icon"
						class="size-4 shrink-0 object-contain"
						alt=""
						aria-hidden="true" />
					<span v-else class="lucide-plug size-3.5 text-ink-gray-6" aria-hidden="true" />
				</template>
				<div class="flex min-w-0 flex-col">
					<span class="truncate">{{ extension.label }}</span>
					<span v-if="extension.label !== extension.name" class="truncate text-xs text-ink-gray-5">
						{{ extension.name }}
					</span>
				</div>
				<template #suffix>
					<template v-if="isDevExtension(extension)">
						<Tooltip text="Served by a dev server. A reload drops it.">
							<Badge size="sm" theme="orange" label="Dev" />
						</Tooltip>
						<Tooltip text="Stop this dev extension">
							<Button variant="ghost" size="sm" icon="lucide-unplug" @click="stopDevExtension()" />
						</Tooltip>
					</template>
				</template>
			</ItemListRow>
		</div>

		<Button
			v-if="isDeveloperMode"
			variant="subtle"
			icon-left="lucide-plug"
			label="Load dev extension"
			@click="showDevExtensionDialog = true" />
	</div>
</template>

<script setup lang="ts">
import { installedExtensions } from "@/data/extensions";
import { isDevExtension, showDevExtensionDialog, stopDevExtension } from "@/extensions/devExtension";
import { Badge, Button, ItemListRow, Tooltip } from "frappe-ui";

// loading one runs code the editor never installed, so only a developer sees the button
const isDeveloperMode = Boolean(window.is_developer_mode);
</script>
