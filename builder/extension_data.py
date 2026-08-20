# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What one extension may do to one doctype.

Three gates stand between an extension and a document. The capability says the
extension may work with site data at all, and an admin answers it at install. The
grant here says which doctype, and the user answers it while the editor runs.
Frappe's own permission says whether this user may do it, and it is the only one
that cannot be widened: nothing in this module passes `ignore_permissions`.

A grant is asked for, never assumed. `data.requestAccess` in the browser is the
one path that opens a dialog, and every other call refuses without a grant.
"""

import frappe
import frappe.client
from frappe import _

from builder.extensions import find_extension, resolve_extension

GRANT_DOCTYPE = "Builder Extension Grant"

ACCESS_FIELDS = {"read": "can_read", "write": "can_write", "delete": "can_delete"}

NO_ACCESS = {"read": False, "write": False, "delete": False, "denied": False}

# a page of rows, and the ceiling one call can ask for. The server owns this
# number: it is the side protecting the database, and a copy in the browser
# would be a second owner of one rule
DEFAULT_PAGE_LENGTH = 20
MAX_PAGE_LENGTH = 500


class ExtensionGrantRequired(frappe.PermissionError):
	"""No grant covers this doctype yet.

	Its own class because the class name travels to the browser as `exc_type`,
	which is how the host tells "ask the user" apart from "the user cannot do
	this at all". Every other refusal here is an ordinary permission error.
	"""


@frappe.whitelist()
def get_extension_grant(extension: str, doctype: str) -> dict:
	"""What this extension may already do to this doctype.

	An unknown extension and an ungranted doctype answer the same way, because
	both mean the same thing to the caller: nothing is allowed yet.
	"""
	owner = find_extension(extension)
	return describe_grant(owner, doctype) if owner else {"doctype": doctype, **NO_ACCESS}


@frappe.whitelist()
def record_extension_grant(
	extension: str, doctype: str, access: list[str] | None = None, denied: bool = False
) -> dict:
	"""Write what the user answered in the Builder dialog.

	The browser is the only witness to that answer. The dialog is host chrome, and
	an extension frame cannot reach this method at all: it runs at an opaque origin
	and carries no session cookie, so the host is the only caller.

	Merges, and never removes what a call leaves unmentioned. That is the rule
	`set_extension_tokens` follows too. An admin narrows a grant in Desk, and a
	later `data.revokeAccess` can narrow it from an extension.
	"""
	owner = resolve_extension(extension, GRANT_DOCTYPE)
	allowed = set() if denied else read_access(access)

	values = {field: 1 for name, field in ACCESS_FIELDS.items() if name in allowed}
	values["denied"] = int(denied)
	values["granted_by"] = frappe.session.user

	name = find_extension_grant(owner, doctype)
	if name:
		frappe.get_doc(GRANT_DOCTYPE, name).update(values).save()
	else:
		frappe.get_doc(
			{"doctype": GRANT_DOCTYPE, "extension": owner, "document_type": doctype, **values}
		).insert()

	return describe_grant(owner, doctype)


def read_access(access: list[str] | None) -> set[str]:
	access = set(access or [])
	unknown = sorted(access - set(ACCESS_FIELDS))
	if unknown:
		frappe.throw(_("Unknown access: {0}").format(", ".join(unknown)))
	return access


def describe_grant(extension: str, doctype: str) -> dict:
	grant = frappe.db.get_value(
		GRANT_DOCTYPE,
		{"extension": extension, "document_type": doctype},
		[*ACCESS_FIELDS.values(), "denied"],
		as_dict=True,
	)
	if not grant:
		return {"doctype": doctype, **NO_ACCESS}

	answer = {name: bool(grant[field]) for name, field in ACCESS_FIELDS.items()}
	return {"doctype": doctype, **answer, "denied": bool(grant.denied)}


def find_extension_grant(extension: str, doctype: str) -> str | None:
	return frappe.db.get_value(GRANT_DOCTYPE, {"extension": extension, "document_type": doctype}, "name")


def assert_grant(extension: str, doctype: str, access: str) -> None:
	"""The gate every data method opens with. Refuses loudly, and names what is missing.

	Called from the server rather than trusted to the browser, so the grant is
	checked on the same side as the write it guards.
	"""
	owner = find_extension(extension)
	grant = describe_grant(owner, doctype) if owner else NO_ACCESS
	if grant.get(access):
		return

	frappe.throw(
		_('"{0}" was not granted {1} access to {2}.').format(extension, access, doctype),
		ExtensionGrantRequired,
	)


@frappe.whitelist()
def get_list(
	extension: str,
	doctype: str,
	fields: list[str] | None = None,
	filters: dict | list | None = None,
	order_by: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = DEFAULT_PAGE_LENGTH,
) -> list[dict]:
	"""One page of documents.

	`frappe.client` does the query and the permission check, so an extension
	reaches exactly the rows the user reaches, with the field-level rules the
	user has. The grant is the extra gate in front of that, never a way past it.
	"""
	assert_grant(extension, doctype, "read")
	return frappe.client.get_list(
		doctype=doctype,
		fields=fields,
		filters=filters,
		order_by=order_by,
		limit_start=limit_start,
		limit_page_length=read_page_length(limit_page_length),
	)


@frappe.whitelist()
def get_count(extension: str, doctype: str, filters: dict | list | None = None) -> int:
	"""How many documents match, without fetching them.

	`frappe.client.get_count` reaches `reportview.get_count`, which reads the
	**whole request form_dict** rather than only its arguments. This call's own
	`extension` argument therefore lands in the query builder, which answers
	`DatabaseQuery.execute() got an unexpected keyword argument 'extension'`.

	So the dict is emptied for the length of the call. Reaching for
	`frappe.db.count` instead would be simpler and wrong: it skips the user
	permission row filters, so the number would count rows the user cannot read.
	"""
	assert_grant(extension, doctype, "read")

	sent = frappe.local.form_dict
	frappe.local.form_dict = frappe._dict()
	try:
		return frappe.client.get_count(doctype=doctype, filters=filters)
	finally:
		frappe.local.form_dict = sent


@frappe.whitelist()
def get_doc(extension: str, doctype: str, name: str) -> dict:
	"""One whole document, child tables included."""
	assert_grant(extension, doctype, "read")
	return frappe.client.get(doctype=doctype, name=name)


@frappe.whitelist(methods=["POST"])
def insert_doc(extension: str, doctype: str, doc: dict | None = None) -> dict:
	"""The doctype comes from the checked argument, never from the payload.

	Without the overwrite an extension could pass `doctype="Contact"` for the
	grant check and a `doc` naming `User`, and the gate would guard nothing.
	"""
	assert_grant(extension, doctype, "write")
	return frappe.client.insert({**(doc or {}), "doctype": doctype})


@frappe.whitelist(methods=["POST"])
def update_doc(extension: str, doctype: str, name: str, doc: dict | None = None) -> dict:
	"""A patch, not a replacement. `set_value` refuses the framework's own fields."""
	assert_grant(extension, doctype, "write")
	return frappe.client.set_value(doctype, name, doc or {})


@frappe.whitelist(methods=["POST"])
def delete_doc(extension: str, doctype: str, name: str) -> None:
	"""Its own grant, because losing a record is not the same as changing one."""
	assert_grant(extension, doctype, "delete")
	frappe.client.delete(doctype, name)


def read_page_length(limit_page_length: int) -> int:
	"""Frappe reads 0 as "every row", which is the one answer no extension may ask for."""
	if not 1 <= limit_page_length <= MAX_PAGE_LENGTH:
		frappe.throw(_("Ask for 1 to {0} rows at a time.").format(MAX_PAGE_LENGTH))
	return limit_page_length
