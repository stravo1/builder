<template>
	<div class="flex min-h-full flex-col">
		<div class="sticky top-0 bg-surface-base px-3 py-3">
			<BuilderInput
				type="text"
				placeholder="Search extensions"
				:model-value="filter"
				@input="(value: string) => (filter = value)" />
		</div>

		<div class="flex flex-col px-3 pb-3">
			<CollapsibleSection section-name="Installed">
				<p v-if="!installed.length" class="text-p-sm italic text-ink-gray-5">
					{{ filter ? "Nothing here matches that." : "No extensions installed." }}
				</p>

				<div v-else class="flex flex-col">
					<ItemListRow
						v-for="extension in installed"
						:key="extension.name"
						class="cursor-pointer transition-none hover:bg-surface-gray-2"
						:class="!extension.enabled && 'opacity-60'"
						role="button"
						tabindex="0"
						size="md"
						@click="emit('select', extension.name)"
						@keydown.enter.self="emit('select', extension.name)">
						<template #prefix>
							<!-- one box whatever the file measures, so a stray icon cannot set the row height -->
							<img
								v-if="extension.icon"
								:src="extension.icon"
								class="size-4 shrink-0 object-contain"
								alt=""
								aria-hidden="true" />
							<span v-else class="lucide-plug size-4 shrink-0 text-ink-gray-6" aria-hidden="true" />
						</template>
						<!-- The badge sits on the second line, so a label keeps the width of the first. -->
						<div class="flex min-w-0 flex-col gap-1">
							<span class="truncate">{{ extension.label }}</span>
							<div class="flex min-w-0 items-center gap-1.5">
								<span v-if="extension.description" class="truncate text-xs text-ink-gray-5">
									{{ extension.description }}
								</span>
								<Tooltip v-if="isDevExtension(extension)" text="Served by a dev server. A reload drops it.">
									<Badge size="sm" theme="orange" label="Dev" />
								</Tooltip>
								<Badge v-else-if="!extension.enabled" size="sm" theme="gray" label="Disabled" />
							</div>
						</div>
						<template #suffix>
							<Tooltip v-if="isDevExtension(extension)" text="Stop this dev extension">
								<Button
									variant="ghost"
									size="sm"
									icon="lucide-unplug"
									class="mr-2"
									@click.stop="stopDevExtension()" />
							</Tooltip>
							<span class="lucide-chevron-right size-4 text-ink-gray-5" aria-hidden="true" />
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
				<p class="text-p-sm text-ink-gray-5">Coming soon...</p>
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
import { userInstallations } from "@/data/extensions";
import { isDevExtension, showDevExtensionDialog, stopDevExtension } from "@/extensions/devExtension";
import { Badge, Button, ItemListRow, Tooltip } from "frappe-ui";
import { computed, ref } from "vue";

const emit = defineEmits<{ select: [extension: string] }>();

// loading one runs code the editor never installed, so only a developer sees the button
const isDeveloperMode = Boolean(window.is_developer_mode);

const filter = ref("");

/** Search visible details and the package name, which remains a useful lookup key. */
const installed = computed(() => {
	const wanted = filter.value.trim().toLowerCase();
	if (!wanted) return userInstallations.value;

	return userInstallations.value.filter((extension) =>
		`${extension.label} ${extension.description ?? ""} ${extension.name}`.toLowerCase().includes(wanted),
	);
});
</script>
