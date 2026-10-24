<template>
	<!-- deferred, because the header and the tab mount in the same render -->
	<Teleport v-if="drawer" defer :to="`#${drawer.headerId}`">
		<slot />
	</Teleport>
	<slot v-else />
</template>
<script setup lang="ts">
import { drawerKey } from "@/components/LeftPanelTabs";
import { inject, onBeforeUnmount, onMounted } from "vue";

const drawer = inject(drawerKey, null);

onMounted(() => drawer && (drawer.hasCustomHeader.value = true));
onBeforeUnmount(() => drawer && (drawer.hasCustomHeader.value = false));
</script>
