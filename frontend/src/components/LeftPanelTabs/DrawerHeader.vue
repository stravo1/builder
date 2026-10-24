<template>
	<!-- deferred, because the header and the tab mount in the same render. A tab the drawer keeps
	     but does not show takes its content back, so only the shown tab fills the header -->
	<Teleport v-if="drawer" defer :to="`#${drawer.headerId}`" :disabled="!isActive">
		<slot />
	</Teleport>
	<slot v-else />
</template>
<script setup lang="ts">
import { drawerKey } from "@/components/LeftPanelTabs";
import { inject, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";

const drawer = inject(drawerKey, null);
// the drawer keeps its tabs alive, so activation, not mounting, says whether this tab shows
const isActive = ref(false);
const setActive = (active: boolean) => {
	isActive.value = active;
	if (drawer) drawer.hasCustomHeader.value = active;
};

// a tab that loads async mounts after the drawer activated it, so its first onActivated never fires
onMounted(() => setActive(true));
onActivated(() => setActive(true));
onDeactivated(() => setActive(false));
onBeforeUnmount(() => setActive(false));
</script>
