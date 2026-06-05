export const PLUGIN_API_VERSION = "1.0";

export type PluginPermission =
	| "blocks:read"
	| "blocks:write"
	| "selection:write"
	| "viewport:read"
	| "viewport:write";

export type PluginManifest = {
	id: string;
	name: string;
	apiVersion: string;
	main: string;
	ui?: string;
	icon?: string;
	allowedDomains?: string[];
	permissions?: PluginPermission[];
};

export type PluginBlockStyles = {
	base: BlockStyleMap;
	mobile: BlockStyleMap;
	tablet: BlockStyleMap;
	raw: BlockStyleMap;
};

export type PluginBlock = {
	id: string;
	element?: string;
	originalElement?: string;
	blockName?: string;
	children: PluginBlock[];
	styles: PluginBlockStyles;
	attributes: BlockAttributeMap;
	classes: string[];
	props?: BlockProps;
	innerHTML?: string;
	extendedFromComponent?: string;
	draggable?: boolean;
};

export type PluginBlockPatch = Partial<
	Pick<
		PluginBlock,
		| "element"
		| "blockName"
		| "attributes"
		| "classes"
		| "props"
		| "innerHTML"
		| "extendedFromComponent"
		| "draggable"
	>
> & {
	styles?: Partial<PluginBlockStyles>;
};

export type PluginCreateBlockOptions = {
	element?: string;
	blockName?: string;
	parentId?: string;
	index?: number;
	template?: "container" | "text" | "html" | "image";
	styles?: Partial<PluginBlockStyles>;
	attributes?: BlockAttributeMap;
	classes?: string[];
	innerHTML?: string;
};

export type PluginViewport = {
	scale: number;
	translateX: number;
	translateY: number;
};

export type PluginViewportPatch = Partial<PluginViewport>;

export type PluginBundle = {
	id: string;
	name: string;
	manifest: PluginManifest;
	mainScript: string;
	uiHtml?: string;
	isDev?: boolean;
	enabled?: boolean;
	/** Lucide icon id, e.g. lucide-puzzle */
	icon?: string | null;
	/** PNG/WebP/SVG URL for sidebar and menus */
	iconUrl?: string | null;
};

export type PluginRunContext = {
	pluginId: string;
};

export type PluginModule = {
	run: (ctx: PluginRunContext & { builder: PluginBuilderAPI }) => void | Promise<void>;
};

export type PluginBuilderAPI = {
	getRootBlock: () => PluginBlock | null;
	getSelectedBlocks: () => PluginBlock[];
	findBlock: (id: string) => PluginBlock | null;
	getBlocksByElement: (tag: string) => PluginBlock[];
	createBlock: (options: PluginCreateBlockOptions) => PluginBlock;
	updateBlock: (id: string, patch: PluginBlockPatch) => PluginBlock;
	deleteBlock: (id: string) => void;
	selectBlocks: (ids: string[]) => void;
	clearSelection: () => void;
	getViewport: () => PluginViewport;
	setViewport: (patch: PluginViewportPatch) => void;
	history: {
		beginBatch: () => string;
		endBatch: (batchId: string) => void;
	};
	ui: {
		postMessage: (message: unknown) => void;
		onMessage: (handler: (message: unknown) => void) => void;
	};
	on: <E extends PluginEventType>(event: E, handler: (payload: PluginEventPayloadMap[E]) => void) => void;
	off: <E extends PluginEventType>(event: E, handler: (payload: PluginEventPayloadMap[E]) => void) => void;
};

export type PluginEventType = "selectionChange" | "blockHover" | "breakpointChange";

export type PluginEventPayloadMap = {
	selectionChange: { blocks: PluginBlock[] };
	blockHover: { blockId: string | null };
	breakpointChange: { breakpoint: string };
};

export type PluginUIMessage = {
	type: string;
	pluginId: string;
	payload?: unknown;
};
