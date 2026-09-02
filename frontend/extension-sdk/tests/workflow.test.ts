import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

const sdkRoot = path.resolve(import.meta.dirname, "..");

describe("the published author toolkit", () => {
	it("ships the package command and release template", () => {
		expect(packageJson.bin).toEqual({ "builder-extension": "./bin/builder-extension.js" });
		expect(packageJson.files).toEqual(expect.arrayContaining(["bin", "package.js", "templates"]));
	});

	it("validates a pushed tag before it creates the GitHub release", () => {
		const workflow = fs.readFileSync(path.join(sdkRoot, "templates/github/workflows/release.yml"), "utf8");
		expect(workflow).toContain('builder-extension package --tag "$GITHUB_REF_NAME"');
		expect(workflow).toContain('gh release create "$GITHUB_REF_NAME" release/*.builderext');
		expect(workflow.indexOf("builder-extension package")).toBeLessThan(workflow.indexOf("gh release create"));
	});
});
