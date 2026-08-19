<template>
	<!--
		The hidden entry frame of every installed extension (D9). It runs main.js
		and paints nothing, so it is display:none. An extension's visible frames
		are mounted by the surfaces that own them, never here.
	-->
	<div>
		<div class="hidden" aria-hidden="true">
			<ExtensionFrame
				v-for="extension in installedExtensions"
				:key="extension.name"
				:extension="extension.name"
				:entry="extension.entry"
				slot="main"
				:dispatch="dispatcherFor(extension)"
				@connect="(channel) => connectExtension(extension.name, channel)"
				@disconnect="(channel) => disconnectExtension(extension.name, channel)" />
		</div>

		<!-- one per extension, each rendering nothing until ui.openDialog (1.15) -->
		<ExtensionDialog
			v-for="extension in installedExtensions"
			:key="`dialog-${extension.name}`"
			:extension="extension" />
	</div>
</template>

<script setup lang="ts">
import ExtensionDialog from "@/components/ExtensionDialog.vue";
import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { installedExtensions, loadExtensions } from "@/data/extensions";
import { connectExtension, disconnectExtension, dispatcherFor, teardownExtension } from "@/extensions";
import { onMounted, watch } from "vue";

onMounted(loadExtensions);

// unmounting a frame only closes its channel. What an extension registered
// outlives it, so a record that left the list is torn down by name (B2)
watch(installedExtensions, (current, previous) => {
	previous
		?.filter((extension) => !current.some((row) => row.name === extension.name))
		.forEach((extension) => teardownExtension(extension.name));
});
</script>
