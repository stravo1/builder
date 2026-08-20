# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestBuilderExtensionGrant(FrappeTestCase):
	def setUp(self):
		self.extension = frappe.get_doc(
			{
				"doctype": "Builder Extension",
				"extension_name": "acme/grants",
				"label": "Grants",
				"version": "1.0.0",
			}
		).insert()

	def tearDown(self):
		frappe.db.rollback()

	def test_name_is_a_uuid(self):
		grant = frappe.get_doc(
			{
				"doctype": "Builder Extension Grant",
				"extension": self.extension.name,
				"document_type": "Contact",
				"can_read": 1,
			}
		).insert()
		self.assertEqual(len(grant.name), 36)

	def test_extension_must_exist(self):
		grant = frappe.get_doc(
			{
				"doctype": "Builder Extension Grant",
				"extension": "acme-nothing",
				"document_type": "Contact",
			}
		)
		self.assertRaises(frappe.LinkValidationError, grant.insert)

	def test_document_type_must_exist(self):
		grant = frappe.get_doc(
			{
				"doctype": "Builder Extension Grant",
				"extension": self.extension.name,
				"document_type": "No Such Doctype",
			}
		)
		self.assertRaises(frappe.LinkValidationError, grant.insert)
