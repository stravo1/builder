# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import os
import shutil
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extension_assets import ExtensionAsset


def make_extension(**kwargs):
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": "acme/assets",
		"label": "Assets",
		"version": "1.0.0",
		"checksum": "sum123",
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


class TestExtensionAsset(FrappeTestCase):
	def install(self, extension, files=("main.js",)):
		"""Write an install directory the renderer can read from."""
		install_path = Path(extension.install_path)
		install_path.mkdir(parents=True, exist_ok=True)
		self.addCleanup(shutil.rmtree, install_path, ignore_errors=True)
		for name in files:
			(install_path / name).write_text("export const ok = true;")
		return install_path

	def asset(self, path):
		return ExtensionAsset(path=path)

	def test_serves_a_file_from_the_install_directory(self):
		extension = make_extension(extension_name="acme/serve")
		self.install(extension)

		renderer = self.asset("/builder_extension_asset/acme-serve@1.0.0/main.js")

		self.assertTrue(renderer.can_render())

	def test_a_javascript_file_gets_a_module_safe_mimetype(self):
		extension = make_extension(extension_name="acme/mime")
		self.install(extension)

		renderer = self.asset("/builder_extension_asset/acme-mime@1.0.0/main.js")

		self.assertEqual(renderer.mimetype, "text/javascript")

	def test_the_response_allows_any_origin(self):
		extension = make_extension(extension_name="acme/headers")
		self.install(extension)

		headers = self.asset("/builder_extension_asset/acme-headers@1.0.0/main.js").response_headers

		self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
		self.assertEqual(headers["ETag"], '"sum123"')

	def test_a_hashed_chunk_is_immutable(self):
		extension = make_extension(extension_name="acme/chunks")
		self.install(extension, files=("main.js", "panel-abc.js"))

		headers = self.asset("/builder_extension_asset/acme-chunks@1.0.0/panel-abc.js").response_headers

		self.assertIn("immutable", headers["Cache-Control"])

	def test_the_entry_revalidates_because_its_name_never_changes(self):
		"""`main.js` carries no content hash, so it cannot be immutable.

		Its URL has to stay stable, because a chunk sharing a module with the
		entry imports `./main.js`. The ETag is what busts it.
		"""
		extension = make_extension(extension_name="acme/entrycache")
		self.install(extension)

		headers = self.asset("/builder_extension_asset/acme-entrycache@1.0.0/main.js").response_headers

		self.assertNotIn("immutable", headers["Cache-Control"])
		self.assertIn("no-cache", headers["Cache-Control"])

	def test_every_file_of_one_install_shares_the_checksum_etag(self):
		extension = make_extension(extension_name="acme/etag")
		self.install(extension, files=("main.js", "panel-abc.js"))

		entry = self.asset("/builder_extension_asset/acme-etag@1.0.0/main.js")
		chunk = self.asset("/builder_extension_asset/acme-etag@1.0.0/panel-abc.js")

		self.assertEqual(entry.etag, chunk.etag)

	def test_a_path_outside_the_install_directory_is_refused(self):
		extension = make_extension(extension_name="acme/traversal")
		self.install(extension)

		for path in [
			"/builder_extension_asset/acme-traversal@1.0.0/../../site_config.json",
			"/builder_extension_asset/acme-traversal@1.0.0/../acme-other@1.0.0/main.js",
		]:
			self.assertFalse(self.asset(path).can_render(), path)

	def test_an_unknown_extension_is_refused(self):
		self.assertFalse(self.asset("/builder_extension_asset/nobody@1.0.0/main.js").can_render())

	def test_the_wrong_version_is_refused(self):
		extension = make_extension(extension_name="acme/version")
		self.install(extension)

		self.assertFalse(self.asset("/builder_extension_asset/acme-version@9.9.9/main.js").can_render())

	def test_a_disabled_extension_is_refused(self):
		extension = make_extension(extension_name="acme/disabled")
		self.install(extension)
		extension.db_set("enabled", 0)
		frappe.clear_document_cache("Builder Extension", extension.name)

		self.assertFalse(self.asset("/builder_extension_asset/acme-disabled@1.0.0/main.js").can_render())

	def test_another_route_is_not_claimed(self):
		self.assertFalse(self.asset("/builder/page/home").can_render())
