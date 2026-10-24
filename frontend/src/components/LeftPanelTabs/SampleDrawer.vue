<template>
	<div class="flex flex-col gap-3 p-4">
		<p class="text-p-sm text-ink-gray-5">
			{{ __("A drawer tab gets the full width of the editor. These are the registered left panel tabs.") }}
		</p>
		<table class="w-full text-left text-sm">
			<thead class="text-ink-gray-5">
				<tr class="border-b border-outline-gray-1">
					<th v-for="column of columns" :key="column" class="px-2 py-1.5 font-normal">{{ column }}</th>
				</tr>
			</thead>
			<tbody class="text-ink-gray-8">
				<tr v-for="tab of leftPanelTabs.all.value" :key="tab.name" class="border-b border-outline-gray-1">
					<td class="px-2 py-1.5">{{ tab.name }}</td>
					<td class="px-2 py-1.5">{{ tab.label }}</td>
					<td class="px-2 py-1.5">{{ tab.placement ?? "panel" }}</td>
					<td class="px-2 py-1.5">{{ tab.shortcut ?? "" }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
<script setup lang="ts">
import { leftPanelTabs } from "@/components/LeftPanelTabs";
import { __ } from "@/translation";

const columns = [__("Name"), __("Label"), __("Placement"), __("Shortcut")];
</script>
