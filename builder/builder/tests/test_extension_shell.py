# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import re
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.website.serve import get_response_content

from builder.utils import csp_hash, extension_dev_origins

IMPORT_MAP = re.compile(r'<script type="importmap">(.*?)</script>', re.DOTALL)


class TestExtensionShell(FrappeTestCase):
	def setUp(self):
		self.html = get_response_content("/builder_extension")

	def test_csp_allows_the_import_map_the_page_renders(self):
		"""A hash and its content must not drift. Byte for byte, or the browser refuses the map."""
		body = IMPORT_MAP.search(self.html).group(1)

		self.assertIn(csp_hash(body), self.html)

	def test_the_import_map_names_the_sdk(self):
		body = IMPORT_MAP.search(self.html).group(1)

		self.assertIn("frappe-builder-extension-sdk", body)
		self.assertIn("/builder_extension_asset/sdk/extension-sdk.js", body)

	def test_the_shell_loads_the_sdk_as_a_module(self):
		self.assertIn(
			'<script type="module" src="/builder_extension_asset/sdk/extension-sdk.js"></script>',
			self.html,
		)

	def test_the_shell_names_no_extension(self):
		"""One document serves every extension and every slot (D5)."""
		self.assertNotIn("extension_name", self.html)

	def test_the_policy_allows_a_blob_script(self):
		"""How an installed extension runs. The host posts the code, and the SDK
		turns the string into a module through a Blob URL."""
		script_src = re.search(r"script-src ([^;]*);", self.html).group(1)

		self.assertIn("blob:", script_src)

	def test_the_policy_still_names_no_external_origin(self):
		"""blob: is the only thing that loosened. An extension reaches the site alone."""
		connect_src = re.search(r"connect-src ([^;]*);", self.html).group(1)

		self.assertNotIn("blob:", connect_src)
		self.assertIn("'self'", connect_src)

	def test_a_production_site_allows_no_dev_server(self):
		"""The shell in setUp renders on this site, which is in developer mode. Render it again without."""
		with patch.dict(frappe.conf, {"developer_mode": 0}):
			self.assertNotIn("localhost:*", get_response_content("/builder_extension"))


class TestExtensionDevOrigins(FrappeTestCase):
	def test_nothing_without_developer_mode(self):
		with patch.dict(frappe.conf, {"developer_mode": 0}):
			self.assertEqual(extension_dev_origins("http", "ws"), "")

	def test_both_hosts_on_any_port(self):
		with patch.dict(frappe.conf, {"developer_mode": 1}):
			sources = extension_dev_origins("http")

		self.assertEqual(sources, "http://localhost:* http://127.0.0.1:*")

	def test_one_source_per_scheme_and_host(self):
		"""A module is fetched over http, and hot reload opens a websocket."""
		with patch.dict(frappe.conf, {"developer_mode": 1}):
			sources = extension_dev_origins("http", "ws").split()

		self.assertEqual(len(sources), 4)
		self.assertIn("ws://localhost:*", sources)

	def test_the_shell_carries_them_in_developer_mode(self):
		with patch.dict(frappe.conf, {"developer_mode": 1}):
			html = get_response_content("/builder_extension")

		script_src = re.search(r"script-src ([^;]*);", html).group(1)
		connect_src = re.search(r"connect-src ([^;]*);", html).group(1)

		self.assertIn("http://localhost:*", script_src)
		# the module is a script, and its hot reload is a connection
		self.assertNotIn("ws://localhost:*", script_src)
		self.assertIn("ws://localhost:*", connect_src)
