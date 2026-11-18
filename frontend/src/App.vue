<template>
	<div>
		<router-view v-slot="{ Component }">
			<keep-alive>
				<component :is="Component" />
			</keep-alive>
		</router-view>
		<FloatingChat v-if="showsBob" />
		<UseDark attribute="data-theme"></UseDark>
		<FrappeUIProvider />
	</div>
</template>
<script setup lang="ts">
import FloatingChat from "@/components/FloatingChat.vue";
import useBuilderStore from "@/stores/builderStore";
import usePageStore from "@/stores/pageStore";
import { __ } from "@/translation";
import { UseDark } from "@vueuse/components";
import { useTitle } from "@vueuse/core";
import { useSiteReadOnlyNotice } from "@/utils/useSiteReadOnlyNotice";
import { FrappeUIProvider } from "frappe-ui";
import { computed, provide } from "vue";
import { useRoute } from "vue-router";
import { sessionUser } from "./router";
import { sendPendingPersonaSurvey } from "@/utils/personaSurvey";
import { editorDemo } from "@/utils/editorDemo";

// do not remove this
const builderStore = useBuilderStore();
const pageStore = usePageStore();
const route = useRoute();

provide("sessionUser", sessionUser);
sendPendingPersonaSurvey();

const title = computed(() => {
	return pageStore.activePage && route.name !== "home"
		? `${pageStore.activePage.page_title || __("Untitled")} | Builder`
		: "Frappe Builder";
});

useTitle(title);

// one Bob for the dashboard and the editor, outside the kept-alive pages, so moving between them keeps it
const BOB_ROUTES = ["home", "dashboard-item", "builder"];
const showsBob = computed(() => !editorDemo && BOB_ROUTES.includes(String(route.name)));

useSiteReadOnlyNotice();
</script>
