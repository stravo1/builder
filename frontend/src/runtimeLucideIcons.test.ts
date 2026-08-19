import { afterEach, expect, it, vi } from "vitest";
import { createLucideMaskImage, loadRuntimeLucideIcon } from "@/runtimeLucideIcons";

afterEach(() => vi.unstubAllGlobals());

it("loads and normalizes a Lucide icon requested by an extension at runtime", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<svg stroke-width=\"2\" />")));
	const iconSvg = await loadRuntimeLucideIcon("lucide-accessibility");

	expect(iconSvg).toContain("<svg");
	expect(decodeURIComponent(createLucideMaskImage(iconSvg!))).toContain("stroke-width=\"1.5\"");
	expect(fetch).toHaveBeenCalledWith("https://unpkg.com/lucide-static@1.16.0/icons/accessibility.svg");
});
