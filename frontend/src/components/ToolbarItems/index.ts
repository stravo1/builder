import MainMenu from "@/components/MainMenu.vue";
import PublishButton from "@/components/PublishButton.vue";
import ModeSwitcher from "@/components/ToolbarItems/ModeSwitcher.vue";
import PageTitlePopover from "@/components/ToolbarItems/PageTitlePopover.vue";
import ReadOnlyBadge from "@/components/ToolbarItems/ReadOnlyBadge.vue";
import ToolbarActions from "@/components/ToolbarItems/ToolbarActions.vue";
import ViewerAvatars from "@/components/ToolbarItems/ViewerAvatars.vue";
import useBuilderStore from "@/stores/builderStore";
import usePageStore from "@/stores/pageStore";
import { createRegistry, type RegistryItem } from "@/utils/createRegistry";
import type { Component } from "vue";

export type ToolbarRegion = "left" | "center" | "right";

export type ToolbarItem = RegistryItem & {
	region: ToolbarRegion;
	component: Component;
	props?: () => Record<string, unknown>;
};

export const toolbarItems = createRegistry<ToolbarItem>();
export const registerToolbarItem = toolbarItems.register;
const registerBuiltInItem = toolbarItems.registerBuiltIn;

/** Call from a component setup. The store lookups below need an active pinia. */
export function registerBuiltInToolbarItems() {
	const builderStore = useBuilderStore();
	const pageStore = usePageStore();

	registerBuiltInItem({ name: "menu", region: "left", component: MainMenu });
	registerBuiltInItem({ name: "modes", region: "left", component: ModeSwitcher });
	registerBuiltInItem({ name: "page", region: "center", component: PageTitlePopover });

	registerBuiltInItem({
		name: "viewers",
		region: "right",
		component: ViewerAvatars,
		condition: () => builderStore.viewers.length > 0,
	});

	registerBuiltInItem({
		name: "read-only",
		region: "right",
		component: ReadOnlyBadge,
		condition: () => builderStore.readOnlyMode,
	});

	// one item, not five: the icons share a gap-2 group inside a gap-4 region
	registerBuiltInItem({ name: "actions", region: "right", component: ToolbarActions });

	registerBuiltInItem({
		name: "publish",
		region: "right",
		component: PublishButton,
		props: () => ({ disabled: builderStore.readOnlyMode }),
		condition: () => !(builderStore.readOnlyMode && pageStore.activePage?.is_template),
	});
}
