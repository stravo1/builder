# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import re

from frappe.tests.utils import FrappeTestCase
from frappe.website.serve import get_response_content

from builder.utils import csp_hash

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

		self.assertIn("@builder/extension-sdk", body)
		self.assertIn("/builder_extension_asset/sdk/extension-sdk.js", body)

	def test_the_shell_loads_the_sdk_as_a_module(self):
		self.assertIn(
			'<script type="module" src="/builder_extension_asset/sdk/extension-sdk.js"></script>',
			self.html,
		)

	def test_the_shell_names_no_extension(self):
		"""One document serves every extension and every slot (D5)."""
		self.assertNotIn("extension_name", self.html)
