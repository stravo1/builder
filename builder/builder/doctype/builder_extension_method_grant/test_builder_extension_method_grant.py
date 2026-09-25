# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.tests.extension_fixtures import make_installation


class TestBuilderExtensionMethodGrant(FrappeTestCase):
	"""One installation's answer about one method, or one app."""

	def setUp(self):
		self.installation = make_installation("acme/methods")

	def tearDown(self):
		frappe.db.rollback()

	def grant(self, **values):
		return frappe.get_doc(
			{
				"doctype": "Builder Extension Method Grant",
				"installation": self.installation.name,
				"scope": "method",
				"target": "acme.api.export",
				**values,
			}
		)

	def test_name_is_a_uuid(self):
		self.assertEqual(len(self.grant(answer="allowed").insert().name), 36)

	def test_one_answer_per_scope_and_target(self):
		self.grant(answer="allowed").insert()

		self.assertRaises(frappe.UniqueValidationError, self.grant(answer="denied").insert)

	def test_a_method_and_its_app_are_separate_answers(self):
		self.grant(answer="denied").insert()

		self.assertTrue(self.grant(scope="app", target="acme", answer="allowed").insert().name)
