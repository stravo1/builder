<template>
	<!--
		The hidden entry frame of every installed extension (D9). It runs main.js
		and paints nothing, so it is display:none. A UI extension's visible frames
		are mounted by the surfaces that own them, never here.
	-->
	<div class="hidden" aria-hidden="true">
		<ExtensionFrame
			v-for="extension in installedExtensions"
			:key="extension.name"
			:extension="extension.name"
			:entry="extension.entry"
			slot="main"
			:dispatch="dispatch"
			@connect="(channel) => connectExtension(extension.name, channel)"
			@disconnect="(channel) => disconnectExtension(extension.name, channel)" />
	</div>
</template>

<script setup lang="ts">
import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { installedExtensions, loadExtensions } from "@/data/extensions";
import { connectExtension, disconnectExtension, dispatch } from "@/extensions";
import { onMounted } from "vue";

onMounted(loadExtensions);
</script>
