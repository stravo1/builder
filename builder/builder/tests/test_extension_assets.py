# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extensions.assets import ExtensionAsset

SDK_ENTRY = "/builder_extension_asset/sdk/extension-sdk.js"


class TestExtensionAsset(FrappeTestCase):
	"""The route serves the SDK, and nothing else.

	An extension's own code never travels by URL now. Every user has their own
	copy, and a frame sends no session, so a route could not tell whose copy a
	request wanted. The editor reads the file and posts the code instead.
	"""

	def asset(self, path):
		return ExtensionAsset(path=path)

	def test_serves_the_sdk_every_frame_shares(self):
		self.assertTrue(self.asset(SDK_ENTRY).can_render())

	def test_a_javascript_file_gets_a_module_safe_mimetype(self):
		self.assertEqual(self.asset(SDK_ENTRY).mimetype, "text/javascript")

	def test_the_response_allows_any_origin(self):
		"""A frame at an opaque origin makes every request cross-origin."""
		self.assertEqual(self.asset(SDK_ENTRY).response_headers["Access-Control-Allow-Origin"], "*")

	def test_it_revalidates_because_the_name_never_changes(self):
		"""One fixed URL cannot be immutable, or a rebuilt SDK never reaches a browser."""
		headers = self.asset(SDK_ENTRY).response_headers

		self.assertNotIn("immutable", headers["Cache-Control"])
		self.assertIn("no-cache", headers["Cache-Control"])

	def test_the_etag_follows_the_file(self):
		path = Path(frappe.get_app_path("builder", "public", "extension_sdk", "extension-sdk.js"))
		stat = path.stat()

		self.assertEqual(self.asset(SDK_ENTRY).etag, f"{stat.st_mtime_ns}-{stat.st_size}")

	def test_a_path_outside_the_sdk_directory_is_refused(self):
		for path in [
			"/builder_extension_asset/sdk/../../../site_config.json",
			"/builder_extension_asset/sdk/../hooks.py",
		]:
			self.assertFalse(self.asset(path).can_render(), path)

	def test_a_missing_file_is_refused(self):
		self.assertFalse(self.asset("/builder_extension_asset/sdk/nothing.js").can_render())

	def test_no_folder_but_the_sdk_is_served(self):
		"""What used to serve an install. One user's files have no URL now."""
		self.assertFalse(self.asset("/builder_extension_asset/acme-icons@1.0.0/main.js").can_render())

	def test_another_route_is_not_claimed(self):
		self.assertFalse(self.asset("/builder/page/home").can_render())
