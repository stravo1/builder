import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

const sdkRoot = path.resolve(import.meta.dirname, "..");

describe("the published author toolkit", () => {
	it("ships the package command and release template", () => {
		expect(packageJson.bin).toEqual({ "builder-extension": "./bin/builder-extension.js" });
		expect(packageJson.files).toEqual(
			expect.arrayContaining(["bin", "create.js", "package.js", "templates"]),
		);
	});

	it("publishes pushed tags and releases created on GitHub", () => {
		const workflow = fs.readFileSync(path.join(sdkRoot, "templates/github/workflows/release.yml"), "utf8");
		expect(workflow).toContain("release:");
		expect(workflow).toContain("types:");
		expect(workflow).toContain('npm run package -- --tag "$RELEASE_TAG"');
		expect(workflow).toContain('gh release create "$RELEASE_TAG" release/*.builderext');
		expect(workflow).toContain('gh release upload "$RELEASE_TAG" release/*.builderext');
		expect(workflow).not.toContain("--clobber");
	});
});
