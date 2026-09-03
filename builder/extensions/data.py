# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What one extension may do to one doctype, for one installation.

Three gates stand between an extension and a document. The capability says the
extension may work with site data at all, and the user answers that at install.
The grant here says which doctype, and the same user answers it while the editor
runs. Frappe's own permission says whether that user may do it, and it is the
only one that cannot be widened: nothing in this module passes
`ignore_permissions`.

Every gate belongs to one installation, the way `Builder Extension State` does.
One user allowing an extension to read Contact says nothing about the next user,
who is asked again, and nothing about a second copy of that extension.

A grant is asked for, never assumed. `data.requestAccess` in the browser is the
one path that opens a dialog, and every other call refuses without a grant.
"""

import frappe
import frappe.client
from frappe import _

from builder.extensions.access import assert_extension_access

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
	"""What this extension may already do to this doctype, for this user."""
	installation = assert_extension_access(extension, "data.access")
	return describe_grant(installation, doctype)


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
	installation = assert_extension_access(extension, "data.access", writes=GRANT_DOCTYPE)
	allowed = set() if denied else read_access(access)

	values = {field: 1 for name, field in ACCESS_FIELDS.items() if name in allowed}
	values["denied"] = int(denied)

	upsert_grant(installation, doctype, values)
	return describe_grant(installation, doctype)


def read_access(access: list[str] | None) -> set[str]:
	access = set(access or [])
	unknown = sorted(access - set(ACCESS_FIELDS))
	if unknown:
		frappe.throw(_("Unknown access: {0}").format(", ".join(unknown)))
	return access


def describe_grant(installation: str, doctype: str) -> dict:
	grant = frappe.db.get_value(
		GRANT_DOCTYPE,
		{"installation": installation, "document_type": doctype},
		[*ACCESS_FIELDS.values(), "denied"],
		as_dict=True,
	)
	if not grant:
		return {"doctype": doctype, **NO_ACCESS}

	answer = {name: bool(grant[field]) for name, field in ACCESS_FIELDS.items()}
	return {"doctype": doctype, **answer, "denied": bool(grant.denied)}


def find_extension_grant(installation: str, doctype: str) -> str | None:
	return frappe.db.get_value(
		GRANT_DOCTYPE, {"installation": installation, "document_type": doctype}, "name"
	)


def upsert_grant(installation: str, doctype: str, values: dict) -> None:
	"""Write an answer, merging into whatever stands.

	Both callers merge: `record_extension_grant` writes what the user answered,
	and `schema.grant_everything` writes a full grant on a table the extension
	just made. Neither removes what its call leaves unmentioned.
	"""
	name = find_extension_grant(installation, doctype)
	if name:
		frappe.get_doc(GRANT_DOCTYPE, name).update(values).save()
		return

	frappe.get_doc(
		{
			"doctype": GRANT_DOCTYPE,
			"installation": installation,
			"document_type": doctype,
			**values,
		}
	).insert()


def forget_grant(installation: str, doctype: str) -> None:
	"""Drop the answer, so the next request asks again.

	Nothing here narrows a grant. A user takes one back by forgetting it, and a
	dropped doctype forgets its own, so a doctype remade under the same name
	inherits nothing.
	"""
	name = find_extension_grant(installation, doctype)
	if name:
		frappe.delete_doc(GRANT_DOCTYPE, name)


def assert_grant(installation: str, extension: str, doctype: str, access: str) -> None:
	"""What this user allowed for this doctype. Refuses loudly, and names what is missing.

	Called from the server rather than trusted to the browser, so the grant is
	checked on the same side as the write it guards. `extension` names the
	refusal, because the message travels to the author and an installation name
	is a uuid.
	"""
	if describe_grant(installation, doctype).get(access):
		return

	frappe.throw(
		_('"{0}" was not granted {1} access to {2}.').format(extension, access, doctype),
		ExtensionGrantRequired,
	)


def assert_data_access(extension: str, doctype: str, access: str) -> None:
	"""Both gates, in the order they have to run.

	The capability says this extension may touch site data at all. The grant says
	which doctype. Neither replaces the other, and Frappe checks the user after
	both.
	"""
	installation = assert_extension_access(extension, "data.access")
	assert_grant(installation, extension, doctype, access)


@frappe.whitelist()
def get_list(
	extension: str,
	doctype: str,
	fields: list[str] | None = None,
	filters: dict | list | None = None,
	or_filters: dict | list | None = None,
	order_by: str | None = None,
	group_by: str | None = None,
	limit_start: int = 0,
	limit_page_length: int = DEFAULT_PAGE_LENGTH,
) -> list[dict]:
	"""One page of documents.

	`frappe.client` does the query and the permission check, so an extension
	reaches exactly the rows the user reaches, with the field-level rules the
	user has. The grant is the extra gate in front of that, never a way past it.

	`or_filters` and `group_by` are here because `createListResource` sends them
	on every fetch. Dropping a filter quietly would answer with more rows than
	the caller asked for, which is a correctness bug rather than a missing
	feature.
	"""
	assert_data_access(extension, doctype, "read")
	return frappe.client.get_list(
		doctype=doctype,
		fields=fields,
		filters=filters,
		or_filters=or_filters,
		order_by=order_by,
		group_by=group_by,
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
	assert_data_access(extension, doctype, "read")

	sent = frappe.local.form_dict
	frappe.local.form_dict = frappe._dict()
	try:
		return frappe.client.get_count(doctype=doctype, filters=filters)
	finally:
		frappe.local.form_dict = sent


@frappe.whitelist()
def get_doc(extension: str, doctype: str, name: str) -> dict:
	"""One whole document, child tables included."""
	assert_data_access(extension, doctype, "read")
	return frappe.client.get(doctype=doctype, name=name)


@frappe.whitelist(methods=["POST"])
def insert_doc(extension: str, doctype: str, doc: dict | None = None) -> dict:
	"""The doctype comes from the checked argument, never from the payload.

	Without the overwrite an extension could pass `doctype="Contact"` for the
	grant check and a `doc` naming `User`, and the gate would guard nothing.
	"""
	assert_data_access(extension, doctype, "write")
	return frappe.client.insert({**(doc or {}), "doctype": doctype})


@frappe.whitelist(methods=["POST"])
def update_doc(extension: str, doctype: str, name: str, doc: dict | None = None) -> dict:
	"""A patch, not a replacement. `set_value` refuses the framework's own fields."""
	assert_data_access(extension, doctype, "write")
	return frappe.client.set_value(doctype, name, doc or {})


@frappe.whitelist(methods=["POST"])
def delete_doc(extension: str, doctype: str, name: str) -> None:
	"""Its own grant, because losing a record is not the same as changing one."""
	assert_data_access(extension, doctype, "delete")
	frappe.client.delete(doctype, name)


def read_page_length(limit_page_length: int) -> int:
	"""Frappe reads 0 as "every row", which is the one answer no extension may ask for."""
	if not 1 <= limit_page_length <= MAX_PAGE_LENGTH:
		frappe.throw(_("Ask for 1 to {0} rows at a time.").format(MAX_PAGE_LENGTH))
	return limit_page_length
