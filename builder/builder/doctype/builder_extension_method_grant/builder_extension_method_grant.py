# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import uuid

import frappe
from frappe.model.document import Document


class BuilderExtensionMethodGrant(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		answer: DF.Literal["not asked", "allowed", "denied"]
		installation: DF.Link
		scope: DF.Literal["method", "app"]
		target: DF.Data
	# end: auto-generated types

	def autoname(self):
		# a uuid, looked up by (installation, scope, target), the way a doctype grant is
		if not self.name:
			self.name = str(uuid.uuid4())


def on_doctype_update():
	"""One answer per installation, scope and target."""
	frappe.db.add_unique(
		"Builder Extension Method Grant",
		["installation", "scope", "target"],
		constraint_name="unique_installation_scope_target",
	)
