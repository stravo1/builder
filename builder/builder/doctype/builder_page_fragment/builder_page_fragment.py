# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import copy
import hashlib

import frappe
from frappe.model.document import Document
from frappe.utils.jinja import render_template

from builder.utils import clean_data, compact_json


class BuilderPageFragment(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		block_id: DF.Data
		block_json: DF.LongText
		blocks_hash: DF.Data
		component_id: DF.Link
		component_version: DF.Data | None
		page: DF.Link
	# end: auto-generated types

	pass


def delete_component_fragments(page_name: str):
	if not frappe.db.table_exists("Builder Page Fragment"):
		return
	frappe.db.delete("Builder Page Fragment", {"page": page_name})


def refresh_component_fragments(page):
	if not frappe.db.table_exists("Builder Page Fragment"):
		return

	if not page.blocks:
		delete_component_fragments(page.name)
		return

	blocks = frappe.parse_json(page.blocks)
	if not isinstance(blocks, list):
		blocks = [blocks]

	delete_component_fragments(page.name)
	blocks_hash = get_blocks_hash(blocks)

	from builder.builder.doctype.builder_page.builder_page import (
		extend_block_with_component,
		has_reactive_props,
	)

	for block in iter_component_instance_blocks(blocks):
		component_block, _component_id = extend_block_with_component(copy.deepcopy(block))
		if not has_reactive_props(component_block):
			continue

		frappe.get_doc(
			{
				"doctype": "Builder Page Fragment",
				"page": page.name,
				"block_id": block.get("blockId"),
				"component_id": block.get("extendedFromComponent"),
				"component_version": block.get("componentVersion"),
				"blocks_hash": blocks_hash,
				"block_json": compact_json(block),
			}
		).insert(ignore_permissions=True)


def render_component_fragment(
	page,
	block_id: str,
	props: dict | str | None = None,
	route_variables: dict | str | None = None,
) -> dict:
	if not page.published:
		frappe.throw(frappe._("Page is not published"), frappe.PermissionError)

	if page.authenticated_access and frappe.session.user == "Guest":
		raise frappe.PermissionError("Please log in to view this page.")

	fragment_name = frappe.db.get_value(
		"Builder Page Fragment",
		{"page": page.name, "block_id": block_id},
		"name",
	)
	if not fragment_name:
		frappe.throw(frappe._("Component fragment not found"), frappe.DoesNotExistError)

	fragment = frappe.get_doc("Builder Page Fragment", fragment_name)
	if fragment.blocks_hash != get_blocks_hash(page.blocks):
		frappe.throw(frappe._("Component fragment is stale"), frappe.ValidationError)

	props = frappe.parse_json(props or "{}")
	if not isinstance(props, dict):
		frappe.throw(frappe._("Props must be a JSON object"), frappe.ValidationError)
	if len(frappe.as_json(props)) > 20_000:
		frappe.throw(frappe._("Props payload is too large"), frappe.ValidationError)

	route_variables = frappe.parse_json(route_variables or "{}")
	if not isinstance(route_variables, dict):
		frappe.throw(frappe._("Route variables must be a JSON object"), frappe.ValidationError)

	from builder.builder.doctype.builder_page.builder_page import get_block_html

	page_data = page._get_page_data(route_variables=route_variables, for_render=True)
	block = frappe.parse_json(fragment.block_json)
	apply_fragment_prop_values(block, props)

	content, style, _, _ = get_block_html([block])
	context = frappe._dict(page_data)
	context.page_name = page.name
	context.page_data = clean_data(page_data)
	context.style = render_template(style, page_data)
	context.__content = content
	try:
		html = render_template(context.__content, context)
		rendered_style = render_template(context.style, context)
	except Exception:
		html = render_template(
			"templates/generators/component_fragment_error.html",
			{"block_id": block_id},
		)
		rendered_style = ""

	return {"html": html, "style": rendered_style}


def get_blocks_hash(blocks: str | list | None) -> str:
	return hashlib.sha256(compact_json(frappe.parse_json(blocks or "[]")).encode()).hexdigest()


def iter_component_instance_blocks(blocks: list[dict]):
	for block in blocks or []:
		if not block:
			continue
		if block.get("extendedFromComponent") and block.get("blockId"):
			yield block
		yield from iter_component_instance_blocks(block.get("children") or [])


def apply_fragment_prop_values(block: dict, values: dict):
	block_props = block.get("props") or {}
	for prop_name, value in values.items():
		prop_config = block_props.get(prop_name)
		if isinstance(prop_config, dict):
			prop_config["value"] = value
	block["props"] = block_props
