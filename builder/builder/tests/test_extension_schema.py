# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.extension_data import get_extension_grant
from builder.extension_schema import (
	create_doctype,
	delete_doctype,
	get_doctype,
	list_doctypes,
	update_doctype,
)

NAME = "Sample Widget"


def make_extension(name="acme/schema", **kwargs):
	defaults = {
		"doctype": "Builder Extension",
		"extension_name": name,
		"label": "Schema",
		"version": "1.0.0",
		"checksum": "sum123",
		"enabled": 1,
		"capabilities": '["schema.write", "data.access"]',
	}
	return frappe.get_doc({**defaults, **kwargs}).insert()


def a_field(**over):
	return {"fieldname": "title", "label": "Title", "fieldtype": "Data", **over}


EXTENSIONS = ("acme-schema", "acme-other", "acme-idle")


def clean_up():
	"""Creating a doctype runs DDL, and DDL commits the transaction in MariaDB.

	So `db.rollback()` cannot undo an insert that happened before one, and every
	record this file makes has to be removed by hand. Dropping the extension
	takes its grants and resources with it, through `on_trash`.
	"""
	if frappe.db.exists("DocType", NAME):
		frappe.delete_doc("DocType", NAME, force=True)
	for name in EXTENSIONS:
		if frappe.db.exists("Builder Extension", name):
			frappe.delete_doc("Builder Extension", name, force=True)
	frappe.db.commit()


class TestExtensionSchema(FrappeTestCase):
	def setUp(self):
		clean_up()
		self.extension = make_extension()

	def tearDown(self):
		clean_up()

	def create(self, **over):
		return create_doctype("acme/schema", NAME, [a_field()], **over)

	def test_creates_a_doctype(self):
		self.create()

		self.assertTrue(frappe.db.exists("DocType", NAME))

	def test_what_it_makes_is_always_custom(self):
		"""A non-custom doctype needs developer mode and writes files (doctype.py:334)."""
		self.create()

		self.assertTrue(frappe.db.get_value("DocType", NAME, "custom"))

	def test_the_new_doctype_belongs_to_the_builder_module(self):
		self.create()

		self.assertEqual(frappe.db.get_value("DocType", NAME, "module"), "Builder")

	def test_ownership_is_recorded(self):
		self.create()

		self.assertTrue(
			frappe.db.exists(
				"Builder Extension Resource",
				{"extension": self.extension.name, "resource_type": "DocType", "resource_name": NAME},
			)
		)

	def test_the_maker_gets_a_full_grant_with_no_prompt(self):
		"""It made the table, so asking whether it may read the table has one answer."""
		self.create()

		grant = get_extension_grant("acme/schema", NAME)
		self.assertTrue(grant["read"])
		self.assertTrue(grant["write"])
		self.assertTrue(grant["delete"])

	def test_the_default_naming_is_a_hash(self):
		self.create()

		self.assertEqual(frappe.db.get_value("DocType", NAME, "naming_rule"), "Random")

	def test_naming_by_autoincrement(self):
		self.create(naming="autoincrement")

		self.assertEqual(frappe.db.get_value("DocType", NAME, "naming_rule"), "Autoincrement")

	def test_an_unknown_naming_is_refused(self):
		self.assertRaises(
			frappe.ValidationError, create_doctype, "acme/schema", NAME, [a_field()], "sequential"
		)

	def test_a_doctype_needs_a_field(self):
		self.assertRaises(frappe.ValidationError, create_doctype, "acme/schema", NAME, [])

	def test_a_field_type_it_cannot_add_is_refused(self):
		"""A Table needs a child doctype, so it is not on the list."""
		self.assertRaises(
			frappe.ValidationError,
			create_doctype,
			"acme/schema",
			NAME,
			[a_field(fieldtype="Table", options="Contact")],
		)

	def test_a_data_field_needs_a_fieldname(self):
		self.assertRaises(
			frappe.ValidationError, create_doctype, "acme/schema", NAME, [{"fieldtype": "Data"}]
		)

	def test_a_layout_break_needs_no_fieldname(self):
		create_doctype("acme/schema", NAME, [a_field(), {"fieldtype": "Section Break"}])

		self.assertTrue(frappe.db.exists("DocType", NAME))

	def test_a_name_with_a_path_separator_is_refused(self):
		self.assertRaises(frappe.ValidationError, create_doctype, "acme/schema", "Sample/Widget", [a_field()])

	def test_a_name_already_taken_is_refused(self):
		self.assertRaises(frappe.ValidationError, create_doctype, "acme/schema", "Contact", [a_field()])

	def test_reads_back_the_fields_it_made(self):
		self.create()

		described = get_doctype("acme/schema", NAME)
		self.assertIn("title", [field["fieldname"] for field in described["fields"]])

	def test_reading_a_doctype_needs_a_grant(self):
		self.assertRaises(frappe.PermissionError, get_doctype, "acme/schema", "Contact")

	def test_update_adds_a_field(self):
		self.create()

		update_doctype("acme/schema", NAME, [a_field(fieldname="note", label="Note")])

		self.assertIn("note", [field.fieldname for field in frappe.get_meta(NAME).fields])

	def test_update_never_removes_a_field_it_leaves_unmentioned(self):
		"""Removing a field drops a column and the data in it."""
		self.create()

		update_doctype("acme/schema", NAME, [a_field(fieldname="note", label="Note")])

		self.assertIn("title", [field.fieldname for field in frappe.get_meta(NAME).fields])

	def test_update_changes_a_field_already_there(self):
		self.create()

		update_doctype("acme/schema", NAME, [a_field(label="Headline")])

		self.assertEqual(frappe.get_meta(NAME).get_field("title").label, "Headline")

	def test_only_the_maker_may_change_a_doctype(self):
		"""A document grant says nothing about reshaping the table."""
		self.create()
		make_extension("acme/other")

		self.assertRaises(
			frappe.PermissionError, update_doctype, "acme/other", NAME, [a_field(fieldname="note")]
		)

	def test_only_the_maker_may_drop_a_doctype(self):
		self.create()
		make_extension("acme/other")

		self.assertRaises(frappe.PermissionError, delete_doctype, "acme/other", NAME)

	def test_a_doctype_it_did_not_make_cannot_be_dropped(self):
		self.assertRaises(frappe.PermissionError, delete_doctype, "acme/schema", "Contact")

	def test_delete_drops_the_doctype_and_forgets_it(self):
		self.create()

		delete_doctype("acme/schema", NAME)

		self.assertFalse(frappe.db.exists("DocType", NAME))
		self.assertFalse(frappe.db.exists("Builder Extension Resource", {"resource_name": NAME}))

	def test_delete_takes_the_grant_with_it(self):
		"""Frappe lets a DocType be deleted while a Link names it.

		A grant left behind would be inherited by any doctype created later under
		the same name, with nobody asked.
		"""
		self.create()

		delete_doctype("acme/schema", NAME)

		self.assertFalse(frappe.db.exists("Builder Extension Grant", {"document_type": NAME}))

	def test_lists_what_this_extension_made(self):
		self.create()

		self.assertEqual(list_doctypes("acme/schema"), [{"doctype": NAME, "exists": True}])

	def test_lists_nothing_for_an_extension_that_made_nothing(self):
		make_extension("acme/idle")

		self.assertEqual(list_doctypes("acme/idle"), [])

	def test_uninstall_forgets_the_resource_but_keeps_the_table(self):
		"""A table holds the user's data, so uninstalling must not take it away."""
		self.create()

		frappe.delete_doc("Builder Extension", self.extension.name)

		self.assertFalse(frappe.db.exists("Builder Extension Resource", {"resource_name": NAME}))
		self.assertTrue(frappe.db.exists("DocType", NAME))
