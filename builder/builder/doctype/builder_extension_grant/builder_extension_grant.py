# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import uuid

import frappe
from frappe.model.document import Document


class BuilderExtensionGrant(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		can_delete: DF.Check
		can_read: DF.Check
		can_write: DF.Check
		denied: DF.Check
		document_type: DF.Link
		extension: DF.Data
		user: DF.Link
	# end: auto-generated types

	def autoname(self):
		# a uuid, and (user, extension, document_type) is looked up by field, the
		# way Builder Token looks up (extension, key). A composite name would go
		# stale the first time a doctype is renamed
		if not self.name:
			self.name = str(uuid.uuid4())


def on_doctype_update():
	"""One answer per user, extension and doctype."""
	frappe.db.add_unique(
		"Builder Extension Grant",
		["user", "extension", "document_type"],
		constraint_name="unique_user_extension_doctype",
	)
