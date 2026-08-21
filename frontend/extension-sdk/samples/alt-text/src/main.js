/**
 * Counts the images on the page that carry no alt text.
 *
 * One toolbar button and one action. It reads the page and writes nothing, so
 * `page.read` is the only capability it asks for.
 */

import builder from "frappe-builder-extension-sdk";

const walk = (block) => [block, ...(block.children ?? []).flatMap(walk)];

const findImagesWithoutAltText = async () => {
	const roots = await builder.page.getBlocks();
	return roots.flatMap(walk).filter((block) => block.element === "img" && !block.attributes?.alt);
};

builder.actions.register("altText.audit", async () => {
	const missing = await findImagesWithoutAltText();

	await builder.toolbar.update("audit", { badge: missing.length || null });
	await builder.ui.toast(
		missing.length ? `${missing.length} image(s) have no alt text` : "Every image has alt text",
		{ type: missing.length ? "warning" : "success" },
	);
});

builder.toolbar.register({
	name: "audit",
	region: "right",
	icon: "lucide-accessibility",
	tooltip: "Count images with no alt text",
	action: "altText.audit",
});
