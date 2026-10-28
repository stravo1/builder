/**
 * The types of "builder", the editor's own module that a plugin imports.
 *
 * The editor serves the module itself, so these declarations are the only part
 * that a plugin's build reads. Keep them the same as
 * `frontend/src/host/builder.ts` in Builder.
 *
 * The registries and the plugin context are typed in full. The stores,
 * `Block` and `blockController` are typed loosely for now, because their real
 * types reach most of the editor's source.
 */
declare module "builder" {
	import type { Component, ComputedRef } from "vue";

	type RegistryEntry = {
		name: string;
		/** The item shows before the item of this name. */
		before?: string;
		/** The item shows after the item of this name. */
		after?: string;
	};

	type RegistryItem = RegistryEntry & { condition?: () => boolean };

	export type Registry<T> = {
		/** Answers with its own unregister. A second item with the same name replaces the first. */
		register: (item: T) => () => void;
		unregister: (name: string) => boolean;
		all: ComputedRef<T[]>;
		visible: ComputedRef<T[]>;
	};

	export type LeftPanelTab = RegistryItem & {
		label: string;
		/** A lucide class name that Builder already uses, or a component such as `lucideIcon("lucide-blocks")`. */
		icon: string | Component;
		/** Selecting a block keeps this tab open. Without it, the editor shows the layers. */
		keepOpenOnSelection?: boolean;
		component?: Component;
		props?: () => Record<string, unknown>;
		shortcut?: string;
		minWidth?: number;
		lazy?: boolean;
		preload?: () => boolean;
		action?: () => void;
		isActive?: () => boolean;
		/** `"drawer"` opens the tab over the editor, beside the rail and under Builder's main menu. */
		placement?: "panel" | "drawer";
	};

	export type ToolbarItem = RegistryItem & {
		region: "left" | "center" | "right";
		component: Component;
		props?: () => Record<string, unknown>;
	};

	export type BlockMenuContext = { block: Block; target: HTMLElement; fromLayersPanel: boolean };

	export type ContextMenuOption = RegistryEntry & {
		label: string;
		action: (context: BlockMenuContext) => void;
		condition?: (context: BlockMenuContext) => boolean;
		disabled?: (context: BlockMenuContext) => boolean;
	};

	export type BlockProperty = {
		component: Component;
		getProps?: () => Record<string, unknown>;
		events?: Record<string, unknown>;
		searchKeyWords: string;
		condition?: () => boolean;
		innerText?: string;
		usedStyleProperties?: string[];
	};

	export type PropertySection = RegistryItem & {
		properties: BlockProperty[] | (() => BlockProperty[]);
		collapsed?: boolean | ComputedRef<boolean>;
	};

	export type SettingsItem = RegistryItem & {
		label: string;
		title: string;
		icon: string | Component;
		group: "Current Page" | "Global";
		component: Component;
		disabled?: boolean;
	};

	/** One value a block property can show. `key` is a path into the page data, such as `entry.title`. */
	export type DynamicValueItem = {
		key: string;
		comesFrom: "dataScript" | "props" | "componentData";
		/** Shown in place of the key. */
		label?: string;
	};

	/** The property control that opened the "Set Dynamic Value" picker, such as `src` of type `attribute`. */
	export type DynamicValueContext = {
		block: Block;
		property: string;
		type: "style" | "attribute" | "key";
	};

	/** A labelled set of values in the picker. Give only the items that fit the property. */
	export type DynamicValueGroup = RegistryEntry & {
		label: string;
		getItems: (context: DynamicValueContext) => DynamicValueItem[] | Promise<DynamicValueItem[]>;
	};

	/** A tile in the Blocks tab. A drop inserts what `getBlock` returns and selects it. */
	export type BlockTemplateItem = RegistryItem & {
		label: string;
		/** The section of the Blocks tab. A new name adds a section after the built-in ones. */
		category: string;
		icon: Component;
		/** Called on each drop, so every drop gets a fresh tree. */
		getBlock: () => Record<string, unknown> | Promise<Record<string, unknown>>;
	};

	export const leftPanelTabs: Registry<LeftPanelTab>;
	export const dynamicValueGroups: Registry<DynamicValueGroup>;
	export const toolbarItems: Registry<ToolbarItem>;
	export const blockContextMenuOptions: Registry<ContextMenuOption>;
	export const propertySections: Registry<PropertySection>;
	export const settingsItems: Registry<SettingsItem>;
	export const blockTemplates: Registry<BlockTemplateItem>;

	/** One block of the page tree. */
	export class Block {
		constructor(options: Record<string, unknown>);
		blockId: string;
		element: string;
		children: Block[];
		[key: string]: any;
	}

	export const blockController: {
		getSelectedBlocks: () => Block[];
		getFirstSelectedBlock: () => Block;
		[key: string]: any;
	};

	export function usePageStore(): any;
	export function useCanvasStore(): any;
	export function useBuilderStore(): any;

	/** A lucide icon by name, as a component, for any surface that takes an icon. */
	export function lucideIcon(name: string): Component;
	/** In a drawer tab, moves its slot into the drawer's header, in place of the tab's label. Elsewhere it renders the slot in place. */
	export const DrawerHeader: Component;

	/**
	 * The controls of the property panel. Give one as a `BlockProperty.component`.
	 *
	 * `StylePropertyControl` reads and writes the style named by `propertyKey`, and
	 * `AttributePropertyControl` the attribute. `BasePropertyControl` holds a value
	 * of the plugin's own, through `getModelValue` and `setModelValue`. Each one
	 * draws a text input unless its `component` names another widget:
	 * `OptionToggle`, `ColorInput` or `RangeInput`.
	 */
	export const AttributePropertyControl: Component;
	export const BasePropertyControl: Component;
	export const StylePropertyControl: Component;
	export const ColorInput: Component;
	export const OptionToggle: Component;

	/** One Frappe filter row: `[fieldname, operator, value]`. */
	export type WireFilters = [string, string, unknown][];
	/** A field the filter control offers. `value` is the fieldname. */
	export type FilterField = { label: string; value: string; fieldname: string; fieldtype: string; options?: string };
	/** One condition as the filter control holds it. */
	export type FilterCondition = { fieldname: string; operator: string; value: unknown; field?: FilterField };
	/** The operators a field type can filter with, as select options, such as `{ label: "Like", value: "like" }`. */
	export function getOperators(fieldtype: string, fieldname?: string): { label: string; value: string }[];
	export function parseFilters(fields: FilterField[], wire: WireFilters): FilterCondition[];
	export function serializeFilters(conditions: FilterCondition[]): WireFilters;
	export const RangeInput: Component;

	/** What a plugin stores for the user who opens the editor. It merges at the top level. */
	export type PluginState = {
		get: () => Promise<Record<string, unknown>>;
		set: (state: Record<string, unknown>) => Promise<void>;
		unset: (key: string) => Promise<void>;
	};

	/** The second argument of a plugin's `install(app, context)`. */
	export type PluginContext = {
		name: string;
		label: string;
		version: string;
		state: PluginState;
		/** What the Open button in the plugin's details page runs. */
		setOpenHandler: (handler: () => void) => void;
	};
}

/**
 * Every other module of the editor, by its path under `frontend/src/`: a `.ts`
 * module without its suffix, and a `.vue` module with it. For example,
 * `builder/internal/stores/pageStore` or `builder/internal/components/BlockLayers.vue`.
 *
 * These carry no promise. A change in Builder can break a plugin that imports
 * one, so the imports are untyped. Pin the Builder release the plugin was
 * built against.
 */
declare module "builder/internal/*";
