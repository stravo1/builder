# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestBuilderExtensionGrant(FrappeTestCase):
	"""One user's answer about one doctype, for one extension."""

	def tearDown(self):
		frappe.db.rollback()

	def grant(self, **values):
		return frappe.get_doc(
			{
				"doctype": "Builder Extension Grant",
				"user": frappe.session.user,
				"extension": "acme/grants",
				"document_type": "Contact",
				**values,
			}
		)

	def test_name_is_a_uuid(self):
		"""A composite name would go stale the first time a doctype is renamed."""
		self.assertEqual(len(self.grant(can_read=1).insert().name), 36)

	def test_user_must_exist(self):
		self.assertRaises(frappe.LinkValidationError, self.grant(user="nobody@example.com").insert)

	def test_document_type_must_exist(self):
		self.assertRaises(frappe.LinkValidationError, self.grant(document_type="No Such Doctype").insert)

	def test_the_extension_is_a_name_and_needs_no_record(self):
		"""There is no site extension record. The name is the identity."""
		self.assertEqual(self.grant(extension="acme/never-installed").insert().extension, "acme/never-installed")

	def test_two_users_answer_separately(self):
		"""One person allowing an extension says nothing about the next."""
		mine = self.grant(can_read=1).insert()
		theirs = self.grant(user="Guest", can_read=0).insert()

		self.assertNotEqual(mine.name, theirs.name)
		self.assertEqual(mine.user, frappe.session.user)
		self.assertEqual(theirs.user, "Guest")
