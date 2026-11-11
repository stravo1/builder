<template>
	<div class="flex h-screen">
		<DashboardSidebar></DashboardSidebar>
		<div v-if="activeItem" class="flex w-full flex-1 flex-col overflow-hidden">
			<component
				:is="activeItem.component"
				v-bind="activeItem.props?.()"
				:path="itemPath"
				:navigate="navigateItem" />
		</div>
		<div v-else class="flex w-full flex-1 flex-col overflow-hidden">
			<DashboardToolbar class="sticky top-0" />
			<DashboardHead />
			<DashboardContent />
		</div>
	</div>
	<BuilderCommandPalette />
	<TemplatesDialog />
</template>
<script setup lang="ts">
import BuilderCommandPalette from "@/components/BuilderCommandPalette.vue";
import DashboardContent from "@/components/DashboardContent.vue";
import DashboardHead from "@/components/DashboardHead.vue";
import { dashboardItems } from "@/components/DashboardItems";
import DashboardSidebar from "@/components/DashboardSidebar.vue";
import DashboardToolbar from "@/components/DashboardToolbar.vue";
import TemplatesDialog from "@/components/Templates/TemplatesDialog.vue";
import { builderSettings } from "@/data/builderSettings";
import router, { sessionUser } from "@/router";
import { prefetchBuilderSettings, prefetchTemplateGallery } from "@/utils/prefetch";
import { computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const activeItem = computed(() =>
	dashboardItems.visible.value.find((item) => item.name === route.params.item),
);

const itemPath = computed(() => [route.params.path ?? []].flat());
const navigateItem = (path: string[], { replace = false } = {}) => {
	const location = { name: "dashboard-item", params: { item: route.params.item, path } };
	return replace ? router.replace(location) : router.push(location);
};

// a plugin that is off or gone leaves its link behind, so it falls back to All Pages
watch(
	() => route.params.item && !activeItem.value,
	(isMissing) => isMissing && router.replace({ name: "home" }),
	{ immediate: true },
);

onMounted(() => {
	prefetchBuilderSettings();
	prefetchTemplateGallery();
});
// The survey runs on Frappe Cloud sites only; ?persona_survey=test forces the redirect elsewhere.
const devForceShow = new URLSearchParams(window.location.search).get("persona_survey") === "test";
// is_fc_site reads a key only Frappe Cloud V1 sites have, and V2 sites carry Cloud Settings instead
const isCloudSite = window.is_fc_site === "True" || Boolean(window.cloud_settings?.enabled);

watch(
	[() => builderSettings.doc, sessionUser],
	() => {
		if (!isCloudSite && !devForceShow) return;
		if (!builderSettings.doc) return;
		if (builderSettings.doc.persona_survey_done && !devForceShow) return;
		if (!sessionUser.value || sessionUser.value === "Guest") return;
		router.replace({
			name: "persona-survey",
			query: devForceShow ? { persona_survey: "test" } : {},
		});
	},
	{ immediate: true },
);
</script>
