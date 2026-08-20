# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import uuid

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
		extension: DF.Link
		granted_by: DF.Link | None
	# end: auto-generated types

	def autoname(self):
		# a uuid, and the pair (extension, document_type) is looked up by field, the
		# way Builder Token looks up (extension, key). A composite name would go
		# stale the first time a doctype is renamed
		if not self.name:
			self.name = str(uuid.uuid4())
