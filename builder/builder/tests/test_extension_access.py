# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.tests.extension_fixtures import (
	INSTALLATION_DOCTYPE,
	drop_installations,
	make_installation,
	make_user,
)
from builder.extensions.access import (
	assert_extension_access,
	find_installation,
	installation_conditions,
	owns_row,
	owns_through_installation,
	state_conditions,
)

EXTENSION = "acme/gated"


class TestAssertExtensionAccess(FrappeTestCase):
	"""The one gate every protected extension method opens with."""

	def setUp(self):
		drop_installations(EXTENSION)
		self.addCleanup(frappe.set_user, "Administrator")

	def test_answers_with_the_installation_name(self):
		installation = make_installation(EXTENSION)

		self.assertEqual(assert_extension_access(EXTENSION, "data.access"), installation.name)

	def test_refuses_a_guest(self):
		make_installation(EXTENSION)
		frappe.set_user("Guest")

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION)

	def test_refuses_a_user_who_cannot_read_a_builder_page(self):
		"""Builder access is the second gate, checked before any installation."""
		outsider = make_user("extension-outsider@example.com", roles=())
		make_installation(EXTENSION, user=outsider)
		frappe.set_user(outsider)

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION)

	def test_refuses_an_extension_this_user_has_not_installed(self):
		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION)

	def test_refuses_another_users_installation(self):
		make_installation(EXTENSION, user=make_user())

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION)

	def test_refuses_an_installation_the_user_switched_off(self):
		make_installation(EXTENSION, enabled=0)

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION)

	def test_finds_a_switched_off_installation_unless_asked_for_enabled_only(self):
		"""Managing an installation must reach a disabled one to turn it back on."""
		installation = make_installation(EXTENSION, enabled=0)

		self.assertEqual(find_installation(EXTENSION), installation.name)
		self.assertIsNone(find_installation(EXTENSION, enabled_only=True))

	def test_refuses_a_capability_the_user_did_not_grant(self):
		make_installation(EXTENSION, capabilities=["page.edit"])

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION, "data.access")

	def test_needs_no_capability_when_the_method_asks_for_none(self):
		make_installation(EXTENSION, capabilities=[])

		self.assertIsNotNone(assert_extension_access(EXTENSION))

	def test_applies_frappes_own_permission_last(self):
		"""The capability says the extension may try. Frappe says whether this user may."""
		make_installation(EXTENSION)
		frappe.set_user(make_user())

		with self.assertRaises(frappe.PermissionError):
			assert_extension_access(EXTENSION, writes="DocType")

	def test_reads_the_user_from_the_session_and_not_from_a_caller(self):
		"""No argument names a user, which is what stops a browser choosing one."""
		make_installation(EXTENSION)
		theirs = make_user()
		frappe.set_user(theirs)

		self.assertIsNone(find_installation(EXTENSION))


class TestExtensionRowScoping(FrappeTestCase):
	"""What Desk, a report and a get_all see. The methods enforce this too."""

	def setUp(self):
		self.addCleanup(frappe.set_user, "Administrator")

	def test_a_system_manager_sees_every_row(self):
		for conditions in (installation_conditions, state_conditions):
			self.assertEqual(conditions("Administrator"), "")

	def test_another_user_sees_only_their_own(self):
		theirs = make_user()

		self.assertIn(frappe.db.escape(theirs), installation_conditions(theirs))

	def test_state_is_scoped_through_its_installation(self):
		"""A state row names no user, so the condition goes through the record that does."""
		theirs = make_user()

		condition = state_conditions(theirs)
		self.assertIn(INSTALLATION_DOCTYPE, condition)
		self.assertIn(frappe.db.escape(theirs), condition)

	def test_a_user_may_read_their_own_row(self):
		theirs = make_user()
		installation = make_installation("acme/scoped", user=theirs)

		self.assertTrue(owns_row(installation, user=theirs))
		self.assertFalse(owns_row(installation, user="Guest"))

	def test_a_user_may_read_what_hangs_off_their_own_installation(self):
		theirs = make_user()
		installation = make_installation("acme/scoped-state", user=theirs)
		row = frappe.get_doc(
			{
				"doctype": "Builder Extension State",
				"installation": installation.name,
				"key": "theme",
				"value": '"dark"',
			}
		).insert()

		self.assertTrue(owns_through_installation(row, user=theirs))
		self.assertFalse(owns_through_installation(row, user="Guest"))
