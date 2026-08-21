/**
 * Writes one brand ramp as design tokens.
 *
 * A token is a real `Builder Token` row, so it reaches the published site as
 * well as the editor. `key` is this extension's own name for a row, so running
 * the action twice updates the same five tokens.
 */

import builder from "frappe-builder-extension-sdk";

const STEPS = [
	{ step: "50", light: "#eef2ff", dark: "#1e1b4b" },
	{ step: "200", light: "#c7d2fe", dark: "#312e81" },
	{ step: "500", light: "#6366f1", dark: "#818cf8" },
	{ step: "700", light: "#4338ca", dark: "#a5b4fc" },
	{ step: "900", light: "#312e81", dark: "#e0e7ff" },
];

builder.actions.register("brandPalette.write", async () => {
	await builder.tokens.set(
		STEPS.map(({ step, light, dark }) => ({
			key: `brand-${step}`,
			token_name: `Brand ${step}`,
			type: "Color",
			value: light,
			dark_value: dark,
			group: "Brand",
		})),
	);

	await builder.ui.toast("Brand palette written", { type: "success" });
});

builder.toolbar.register({
	name: "write",
	region: "right",
	icon: "lucide-palette",
	tooltip: "Write the brand palette",
	action: "brandPalette.write",
});
