# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Site records an extension reads and writes.

Two gates stand between an extension and a document. The `data.access`
capability says the extension may work with site data at all, and the site
answers that at install. Frappe's own permission says whether the current user
may do it, and nothing here widens it: no method in this module passes
`ignore_permissions`.

There is no per-doctype grant. It existed so one user's answer never stood for
another, and a site-wide install has one answer.
"""

import frappe
import frappe.client
from frappe import _

from builder.extensions.access import assert_extension_access

# a page of rows, and the ceiling one call can ask for. The server owns this
# number: it is the side protecting the database, and a copy in the browser
# would be a second owner of one rule
DEFAULT_PAGE_LENGTH = 20
MAX_PAGE_LENGTH = 500


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
	user has. The capability is the extra gate in front of that, never a way past it.

	`or_filters` and `group_by` are here because `createListResource` sends them
	on every fetch. Dropping a filter quietly would answer with more rows than
	the caller asked for, which is a correctness bug rather than a missing
	feature.
	"""
	assert_extension_access(extension, "data.access")
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
	assert_extension_access(extension, "data.access")

	sent = frappe.local.form_dict
	frappe.local.form_dict = frappe._dict()
	try:
		return frappe.client.get_count(doctype=doctype, filters=filters)
	finally:
		frappe.local.form_dict = sent


@frappe.whitelist()
def get_doc(extension: str, doctype: str, name: str) -> dict:
	"""One whole document, child tables included."""
	assert_extension_access(extension, "data.access")
	return frappe.client.get(doctype=doctype, name=name)


@frappe.whitelist()
def get_meta(extension: str, doctype: str) -> dict:
	"""The doctype's fields and settings, as `/api/v2/doctype/<doctype>/meta` answers."""
	assert_extension_access(extension, "data.access")
	return frappe.get_meta(doctype).as_dict()


@frappe.whitelist(methods=["POST"])
def insert_doc(extension: str, doctype: str, doc: dict | None = None) -> dict:
	"""The doctype comes from the argument, never from the payload, so the call reads as what it does."""
	assert_extension_access(extension, "data.access")
	return frappe.client.insert({**(doc or {}), "doctype": doctype})


@frappe.whitelist(methods=["POST"])
def update_doc(extension: str, doctype: str, name: str, doc: dict | None = None) -> dict:
	"""A patch, not a replacement. `set_value` refuses the framework's own fields."""
	assert_extension_access(extension, "data.access")
	return frappe.client.set_value(doctype, name, doc or {})


@frappe.whitelist(methods=["POST"])
def delete_doc(extension: str, doctype: str, name: str) -> None:
	assert_extension_access(extension, "data.access")
	frappe.client.delete(doctype, name)


def read_page_length(limit_page_length: int) -> int:
	"""Frappe reads 0 as "every row", which is the one answer no extension may ask for."""
	if not 1 <= limit_page_length <= MAX_PAGE_LENGTH:
		frappe.throw(_("Ask for 1 to {0} rows at a time.").format(MAX_PAGE_LENGTH))
	return limit_page_length
