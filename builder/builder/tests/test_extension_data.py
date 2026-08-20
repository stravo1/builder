# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extension_data import assert_grant, get_extension_grant, record_extension_grant


def make_extension(name="acme/data", **kwargs):
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": name,
		"label": "Data",
		"version": "1.0.0",
		"checksum": "sum123",
		"enabled": 1,
		"capabilities": '["data.access"]',
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


class TestExtensionGrants(FrappeTestCase):
	def setUp(self):
		self.extension = make_extension()

	def tearDown(self):
		frappe.db.rollback()

	def test_an_ungranted_doctype_allows_nothing(self):
		grant = get_extension_grant("acme/data", "Contact")

		self.assertEqual(grant, {"doctype": "Contact", "read": False, "write": False, "delete": False, "denied": False})

	def test_an_unknown_extension_allows_nothing(self):
		"""The same answer as an ungranted doctype: nothing is allowed yet."""
		grant = get_extension_grant("acme/absent", "Contact")

		self.assertFalse(grant["read"])

	def test_recording_a_grant_allows_what_was_asked(self):
		grant = record_extension_grant("acme/data", "Contact", ["read"])

		self.assertTrue(grant["read"])
		self.assertFalse(grant["write"])

	def test_a_second_grant_merges_with_the_first(self):
		record_extension_grant("acme/data", "Contact", ["read"])
		grant = record_extension_grant("acme/data", "Contact", ["write"])

		self.assertTrue(grant["read"])
		self.assertTrue(grant["write"])

	def test_granting_clears_an_earlier_denial(self):
		record_extension_grant("acme/data", "Contact", denied=True)
		grant = record_extension_grant("acme/data", "Contact", ["read"])

		self.assertFalse(grant["denied"])
		self.assertTrue(grant["read"])

	def test_a_denial_is_a_row_so_the_extension_is_not_asked_again(self):
		record_extension_grant("acme/data", "Contact", denied=True)
		grant = get_extension_grant("acme/data", "Contact")

		self.assertTrue(grant["denied"])
		self.assertFalse(grant["read"])

	def test_a_denial_leaves_earlier_access_alone(self):
		"""Refusing write does not take back the read the user already allowed."""
		record_extension_grant("acme/data", "Contact", ["read"])
		grant = record_extension_grant("acme/data", "Contact", ["write"], denied=True)

		self.assertTrue(grant["read"])
		self.assertFalse(grant["write"])
		self.assertTrue(grant["denied"])

	def test_an_unknown_access_word_is_refused(self):
		self.assertRaises(
			frappe.ValidationError, record_extension_grant, "acme/data", "Contact", ["publish"]
		)

	def test_one_grant_per_extension_and_doctype(self):
		record_extension_grant("acme/data", "Contact", ["read"])
		record_extension_grant("acme/data", "Contact", ["write"])

		rows = frappe.get_all(
			"Builder Extension Grant",
			filters={"extension": self.extension.name, "document_type": "Contact"},
		)
		self.assertEqual(len(rows), 1)

	def test_a_grant_is_scoped_to_one_extension(self):
		make_extension("acme/other")
		record_extension_grant("acme/data", "Contact", ["read"])

		self.assertFalse(get_extension_grant("acme/other", "Contact")["read"])

	def test_a_grant_is_scoped_to_one_doctype(self):
		record_extension_grant("acme/data", "Contact", ["read"])

		self.assertFalse(get_extension_grant("acme/data", "Blog Post")["read"])

	def test_assert_grant_passes_what_was_granted(self):
		record_extension_grant("acme/data", "Contact", ["read"])

		assert_grant("acme/data", "Contact", "read")

	def test_assert_grant_refuses_what_was_not(self):
		record_extension_grant("acme/data", "Contact", ["read"])

		self.assertRaises(frappe.PermissionError, assert_grant, "acme/data", "Contact", "write")

	def test_assert_grant_refuses_an_unknown_extension(self):
		self.assertRaises(frappe.PermissionError, assert_grant, "acme/absent", "Contact", "read")

	def test_uninstalling_drops_the_grants(self):
		"""A grant is a Link, so without this the extension cannot be deleted at all."""
		record_extension_grant("acme/data", "Contact", ["read"])

		frappe.delete_doc("Builder Extension", self.extension.name)

		self.assertFalse(frappe.get_all("Builder Extension Grant", filters={"extension": self.extension.name}))
