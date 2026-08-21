<template>
	<div class="flex min-h-full flex-col">
		<div class="sticky top-0 z-[1] bg-surface-base px-3 py-3">
			<BuilderInput
				type="text"
				placeholder="Search extensions"
				:model-value="filter"
				@input="(value: string) => (filter = value)" />
		</div>

		<div class="flex flex-col px-3 pb-3">
			<CollapsibleSection :section-name="`Installed — ${installed.length}`">
				<p v-if="!installed.length" class="text-p-sm italic text-ink-gray-5">
					{{ filter ? "Nothing here matches that." : "No extensions installed." }}
				</p>

				<div v-else class="flex flex-col">
					<ItemListRow v-for="extension in installed" :key="extension.name" size="md">
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
						<!-- The badge sits on the second line, so a label keeps the width of the first. -->
						<div class="flex min-w-0 flex-col">
							<span class="truncate">{{ extension.label }}</span>
							<div class="flex min-w-0 items-center gap-1.5">
								<span v-if="extension.description" class="truncate text-xs text-ink-gray-5">
									{{ extension.description }}
								</span>
								<Tooltip v-if="isDevExtension(extension)" text="Served by a dev server. A reload drops it.">
									<Badge size="sm" theme="orange" label="Dev" />
								</Tooltip>
							</div>
						</div>
						<template #suffix>
							<Tooltip v-if="isDevExtension(extension)" text="Stop this dev extension">
								<Button variant="ghost" size="sm" icon="lucide-unplug" @click="stopDevExtension()" />
							</Tooltip>
						</template>
					</ItemListRow>
				</div>
			</CollapsibleSection>

			<!--
				Empty, and it will stay empty until Builder can distribute an extension.
				It is here so the panel says that out loud: an empty list a user can see
				reads as "none yet", where a missing list reads as "this cannot be done".
			-->
			<CollapsibleSection section-name="Marketplace" :section-collapsed="Boolean(filter)">
				<p class="text-p-sm text-ink-gray-5">
					Coming soon...
				</p>
			</CollapsibleSection>
		</div>

		<Button
			v-if="isDeveloperMode"
			class="mx-3 mb-3 mt-auto"
			variant="subtle"
			icon-left="lucide-plug"
			label="Load dev extension"
			@click="showDevExtensionDialog = true" />
	</div>
</template>

<script setup lang="ts">
import CollapsibleSection from "@/components/CollapsibleSection.vue";
import { installedExtensions } from "@/data/extensions";
import { isDevExtension, showDevExtensionDialog, stopDevExtension } from "@/extensions/devExtension";
import { Badge, Button, ItemListRow, Tooltip } from "frappe-ui";
import { computed, ref } from "vue";

// loading one runs code the editor never installed, so only a developer sees the button
const isDeveloperMode = Boolean(window.is_developer_mode);

const filter = ref("");

/** Search visible details and the package name, which remains a useful lookup key. */
const installed = computed(() => {
	const wanted = filter.value.trim().toLowerCase();
	if (!wanted) return installedExtensions.value;

	return installedExtensions.value.filter((extension) =>
		`${extension.label} ${extension.description ?? ""} ${extension.name}`.toLowerCase().includes(wanted),
	);
});
</script>
