import colorsData from "../../../../frappe-ui/tailwind/colors.json";

type ColorsJson = typeof colorsData;

function resolveColorReference(reference: string): string {
	const [mode, color, shade] = reference.split("/");
	if (mode === "lightMode") {
		return (colorsData as ColorsJson).lightMode[color as keyof ColorsJson["lightMode"]][
			shade as keyof (typeof colorsData.lightMode)["gray"]
		];
	}
	if (mode === "darkMode") {
		return (colorsData as ColorsJson).darkMode[color as keyof ColorsJson["darkMode"]][
			shade as keyof (typeof colorsData.darkMode)["gray"]
		];
	}
	if (mode === "overlay") {
		return colorsData.overlay[color as keyof typeof colorsData.overlay][
			shade as keyof (typeof colorsData.overlay)["white"]
		];
	}
	if (mode === "neutral") {
		return colorsData.neutral[color as keyof typeof colorsData.neutral];
	}
	return "#000000";
}

function buildThemeVariables(): { light: Record<string, string>; dark: Record<string, string> } {
	const light: Record<string, string> = {};
	const dark: Record<string, string> = {};

	for (const category of Object.keys(colorsData.themedVariables.light) as Array<
		keyof typeof colorsData.themedVariables.light
	>) {
		for (const colorName of Object.keys(colorsData.themedVariables.light[category])) {
			const variableName = `--${category}-${colorName}`;
			const lightRef = colorsData.themedVariables.light[category][colorName];
			const darkRef = colorsData.themedVariables.dark[category][colorName];
			light[variableName] = resolveColorReference(lightRef);
			dark[variableName] = resolveColorReference(darkRef);
		}
	}

	return { light, dark };
}

const themeVars = buildThemeVariables();

function variablesBlock(vars: Record<string, string>): string {
	return Object.entries(vars)
		.map(([name, value]) => `${name}: ${value};`)
		.join("\n");
}

const PLUGIN_UI_COMPONENT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body.pui {
	height: 100%;
}

body.pui {
	font-family: InterVar, ui-sans-serif, system-ui, -apple-system, sans-serif;
	font-size: 13px;
	line-height: 1.5;
	color: var(--ink-gray-8);
	background: var(--surface-white);
	padding: 12px 14px;
	-webkit-font-smoothing: antialiased;
}

.pui-title {
	font-size: 14px;
	font-weight: 600;
	color: var(--ink-gray-9);
	margin-bottom: 4px;
	letter-spacing: -0.01em;
}

.pui-desc,
.pui-meta {
	font-size: 12px;
	color: var(--ink-gray-5);
	margin-bottom: 12px;
}

.pui-meta { margin-bottom: 6px; }

.pui-section {
	margin-bottom: 14px;
}

.pui-section:last-child { margin-bottom: 0; }

.pui-label {
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--ink-gray-4);
	margin-bottom: 6px;
}

.pui-row {
	display: flex;
	gap: 8px;
	align-items: center;
	margin-bottom: 8px;
}

.pui-field-label {
	font-size: 12px;
	color: var(--ink-gray-6);
	min-width: 72px;
	flex-shrink: 0;
}

.pui-input,
.pui-search {
	width: 100%;
	height: 28px;
	padding: 0 8px;
	border: 1px solid var(--outline-gray-2);
	border-radius: 6px;
	font-size: 13px;
	color: var(--ink-gray-8);
	background: var(--surface-gray-2);
	outline: none;
	transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.pui-input--narrow { width: 64px; flex-shrink: 0; }

.pui-input:hover,
.pui-search:hover {
	border-color: var(--outline-gray-modals);
	background: var(--surface-gray-3);
}

.pui-input:focus,
.pui-search:focus {
	border-color: var(--outline-gray-4);
	background: var(--surface-white);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--outline-gray-3) 35%, transparent);
}

.pui-search { margin-bottom: 10px; }

.pui-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 28px;
	padding: 0 12px;
	border: none;
	border-radius: 6px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition: background 0.15s, opacity 0.15s;
}

.pui-btn--primary {
	color: var(--ink-white);
	background: var(--surface-gray-7);
}

.pui-btn--primary:hover:not(:disabled) {
	background: var(--surface-gray-6);
}

.pui-btn--primary:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.pui-input + .pui-btn,
.pui-search + .pui-grid {
	margin-top: 8px;
}

.pui-status {
	margin-top: 8px;
	font-size: 12px;
	color: var(--ink-gray-5);
	min-height: 18px;
}

.pui-status--success { color: var(--ink-green-3); }
.pui-status--error { color: var(--ink-red-3); }
.pui-status--warn { color: var(--ink-amber-3); }

.pui-grid {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 6px;
}

.pui-grid--icons {
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 6px;
	width: 100%;
	min-height: 160px;
	overflow-x: hidden;
	overflow-y: auto;
	padding: 2px 2px 4px 0;
	align-content: start;
}

.pui-swatch {
	aspect-ratio: 1;
	border-radius: 6px;
	cursor: pointer;
	border: 2px solid transparent;
	transition: border-color 0.15s, transform 0.1s;
}

.pui-swatch:hover {
	border-color: var(--outline-blue-1);
	transform: scale(1.06);
}

.pui-swatch.is-active {
	border-color: var(--ink-blue-3);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--outline-blue-1) 45%, transparent);
}

.pui-swatch--light-border { border: 1px solid var(--outline-gray-2); }

.pui-gradient-swatch {
	border-radius: 8px;
	height: 36px;
	cursor: pointer;
	border: 2px solid transparent;
	margin-bottom: 6px;
	transition: border-color 0.15s;
}

.pui-gradient-swatch:hover { border-color: var(--outline-blue-1); }

.pui-gradient-swatch.is-active {
	border-color: var(--ink-blue-3);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--outline-blue-1) 45%, transparent);
}

.pui-color-row {
	display: flex;
	gap: 6px;
	margin-top: 8px;
}

.pui-color-row input[type="color"] {
	width: 36px;
	height: 28px;
	border: 1px solid var(--outline-gray-2);
	border-radius: 6px;
	padding: 2px;
	cursor: pointer;
	background: var(--surface-white);
}

.pui-color-row .pui-input { flex: 1; font-family: ui-monospace, monospace; font-size: 12px; }

.pui-log {
	border: 1px solid var(--outline-gray-2);
	border-radius: 6px;
	padding: 8px 10px;
	min-height: 120px;
	max-height: 240px;
	overflow-y: auto;
	font-size: 12px;
	margin-bottom: 12px;
	background: var(--surface-gray-1);
}

.pui-log-entry {
	padding: 3px 0;
	border-bottom: 1px solid var(--outline-gray-1);
}

.pui-log-entry:last-child { border-bottom: none; }

.pui-log-entry .dir {
	font-weight: 600;
	font-size: 10px;
	text-transform: uppercase;
	margin-right: 6px;
}

.pui-log-entry .dir.in { color: var(--ink-green-3); }
.pui-log-entry .dir.out { color: var(--ink-blue-3); }

.pui-code {
	background: var(--surface-gray-2);
	border: 1px solid var(--outline-gray-2);
	border-radius: 6px;
	padding: 12px;
	font-size: 11px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	color: var(--ink-gray-8);
	overflow: auto;
	max-height: 60vh;
	white-space: pre-wrap;
	word-break: break-word;
}

.pui-icon-btn {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-start;
	gap: 4px;
	min-width: 0;
	width: 100%;
	max-width: 100%;
	min-height: 52px;
	padding: 6px 2px 4px;
	border: 1px solid transparent;
	border-radius: 6px;
	cursor: pointer;
	background: none;
	font-size: 9px;
	color: var(--ink-gray-5);
	overflow: visible;
	transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.pui-icon-btn:hover {
	border-color: var(--outline-blue-1);
	background: var(--surface-blue-1);
	color: var(--ink-blue-3);
}

.pui-icon-preview {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	min-height: 24px;
	height: 24px;
	color: var(--ink-gray-7);
	flex-shrink: 0;
}

.pui-icon-btn:hover .pui-icon-preview {
	color: var(--ink-blue-3);
}

.pui-icon-preview svg {
	display: block;
	width: 20px;
	height: 20px;
	max-width: 22px;
	max-height: 22px;
	flex-shrink: 0;
}

.pui-icon-btn svg {
	stroke-width: 1.5;
}

.pui-icon-btn .label {
	width: 100%;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pui-icon-btn .placeholder {
	width: 18px;
	height: 18px;
	border-radius: 2px;
	background: var(--surface-gray-3);
}

/* Material Symbols ship with hardcoded black fills */
.pui-material .pui-icon-preview svg,
.pui-material .pui-icon-preview svg path {
	fill: currentColor !important;
}

.pui-empty {
	text-align: center;
	padding: 40px 0;
	color: var(--ink-gray-4);
	font-size: 13px;
}

.pui-muted {
	font-size: 11px;
	color: var(--ink-gray-4);
	margin-bottom: 8px;
}
`;

export function getPluginUiBaseCss(): string {
	return `
:root {
${variablesBlock(themeVars.light)}
}
[data-theme="dark"] {
${variablesBlock(themeVars.dark)}
}
${PLUGIN_UI_COMPONENT_CSS}
`.trim();
}

const BASE_STYLE_TAG = '<style id="builder-plugin-ui-base">';

export function wrapPluginDocument(html: string, isDark: boolean): string {
	const theme = isDark ? "dark" : "light";
	const baseStyle = `${BASE_STYLE_TAG}${getPluginUiBaseCss()}</style>`;
	let doc = html.trim();

	if (!/<html[\s>]/i.test(doc)) {
		doc = `<!DOCTYPE html><html><head></head><body class="pui">${doc}</body></html>`;
	}

	doc = doc.replace(/<html([^>]*)>/i, (_match, attrs: string) => {
		const withoutTheme = attrs.replace(/\s*data-theme=["'][^"']*["']/gi, "");
		return `<html${withoutTheme} data-theme="${theme}">`;
	});

	if (doc.includes("builder-plugin-ui-base")) {
		doc = doc.replace(
			/<style id="builder-plugin-ui-base">[\s\S]*?<\/style>/i,
			baseStyle,
		);
	} else if (/<head[^>]*>/i.test(doc)) {
		doc = doc.replace(/<head([^>]*)>/i, `<head$1>${baseStyle}`);
	} else {
		doc = doc.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${baseStyle}</head>`);
	}

	if (/<body[^>]*class=/i.test(doc)) {
		if (!/\bpui\b/.test(doc)) {
			doc = doc.replace(/<body([^>]*class=["'])([^"']*)(["'])/i, (_m, pre, cls, post) => {
				return `<body${pre}${cls} pui${post}`;
			});
		}
	} else {
		doc = doc.replace(/<body/i, '<body class="pui"');
	}

	// Strip redundant per-plugin light-only styles when using pui classes
	doc = doc.replace(/<style>[\s\S]*?<\/style>\s*(?=<\/head>)/i, (block) => {
		if (block.includes("builder-plugin-ui-base")) return block;
		if (/\bpui-/.test(doc)) return "";
		return block;
	});

	return doc;
}

export function applyPluginThemeToIframe(iframe: HTMLIFrameElement | null, isDark: boolean) {
	const root = iframe?.contentDocument?.documentElement;
	if (!root) return;
	root.setAttribute("data-theme", isDark ? "dark" : "light");
}
