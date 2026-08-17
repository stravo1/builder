# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extensions import get_enabled_extensions


def make_extension(**kwargs):
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": "acme/listed",
		"label": "Listed",
		"version": "1.0.0",
		"runtime": "ui",
		"checksum": "sum123",
		"enabled": 1,
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


class TestGetEnabledExtensions(FrappeTestCase):
	def listed(self, name):
		return next((row for row in get_enabled_extensions() if row["name"] == name), None)

	def test_lists_an_enabled_extension(self):
		make_extension(extension_name="acme/enabled")

		self.assertIsNotNone(self.listed("acme/enabled"))

	def test_leaves_out_a_disabled_extension(self):
		make_extension(extension_name="acme/disabled", enabled=0)

		self.assertIsNone(self.listed("acme/disabled"))

	def test_names_the_extension_not_the_slug(self):
		make_extension(extension_name="acme/named")

		self.assertEqual(self.listed("acme/named")["name"], "acme/named")

	def test_entry_is_the_records_own_script_url(self):
		extension = make_extension(extension_name="acme/entry")

		self.assertEqual(self.listed("acme/entry")["entry"], extension.script_url)

	def test_capabilities_come_back_as_a_list(self):
		make_extension(extension_name="acme/granted", capabilities='["context.read", "block.read"]')

		self.assertEqual(self.listed("acme/granted")["capabilities"], ["context.read", "block.read"])

	def test_capabilities_are_empty_when_none_were_granted(self):
		make_extension(extension_name="acme/plain")

		self.assertEqual(self.listed("acme/plain")["capabilities"], [])

	def test_runtime_reaches_the_client_lowercase(self):
		make_extension(extension_name="acme/silent", runtime="headless")

		self.assertEqual(self.listed("acme/silent")["runtime"], "headless")

	def test_lists_a_headless_extension(self):
		"""A headless extension still needs its entry frame, so it belongs in the list."""
		make_extension(extension_name="acme/quiet", runtime="headless")

		self.assertIsNotNone(self.listed("acme/quiet"))
