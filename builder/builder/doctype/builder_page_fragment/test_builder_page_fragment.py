import hashlib

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.doctype.builder_page_fragment.builder_page_fragment import (
	MAX_KNOWN_SCRIPT_IDS,
	parse_known_script_ids,
	refresh_component_fragments,
	render_component_fragment,
)
from builder.utils import Block


class TestBuilderPageFragment(FrappeTestCase):
	def test_known_script_ids_validation(self):
		script_id = "a" * 16
		self.assertEqual(parse_known_script_ids([script_id, script_id]), {script_id})

		for invalid in ({}, ["short"], ["g" * 16], [1]):
			with self.assertRaises(frappe.ValidationError):
				parse_known_script_ids(invalid)

		with self.assertRaises(frappe.ValidationError):
			parse_known_script_ids(["a" * 16] * (MAX_KNOWN_SCRIPT_IDS + 1))

	def test_fragment_returns_only_missing_scripts(self):
		javascript = 'this.dataset.fragment = "ready";'
		component = frappe.get_doc(
			{
				"doctype": "Builder Component",
				"component_name": f"Fragment Registry {frappe.generate_hash(length=5)}",
				"block": Block(
					element="div",
					blockId="component-root",
					clientScript={"js": javascript},
					props={"title": self.standard_prop("Initial")},
				).as_json(),
			}
		).insert()
		instance = Block(
			blockId="component-instance",
			extendedFromComponent=component.name,
			props={"title": self.standard_prop("Initial")},
		)
		page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Fragment Script Registry Test",
				"published": 1,
				"route": f"/fragment-script-registry-{frappe.generate_hash(length=6)}",
				"blocks": instance.as_json(wrap_in_array=True),
			}
		).insert()

		try:
			refresh_component_fragments(page)
			script_id = hashlib.sha256(javascript.encode()).hexdigest()[:16]

			result = render_component_fragment(page, "component-instance")
			self.assertEqual(result["scripts"], [{"id": script_id, "source": javascript}])
			self.assertNotIn(javascript, result["html"])
			self.assertNotIn("window.builder.clientScripts=", result["html"])
			self.assertIn(f'window.builder.clientScripts["{script_id}"]', result["html"])

			result = render_component_fragment(
				page,
				"component-instance",
				known_script_ids=[script_id],
			)
			self.assertEqual(result["scripts"], [])
		finally:
			page.delete()
			component.delete()

	def test_fragment_is_created_for_non_reactive_component(self):
		component = frappe.get_doc(
			{
				"doctype": "Builder Component",
				"component_name": f"Static Component {frappe.generate_hash(length=5)}",
				"block": Block(element="div", blockId="static-root").as_json(),
			}
		).insert()
		instance = Block(blockId="static-instance", extendedFromComponent=component.name)
		page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Static Fragment Test",
				"published": 1,
				"route": f"/static-fragment-{frappe.generate_hash(length=6)}",
				"blocks": instance.as_json(wrap_in_array=True),
			}
		).insert()

		try:
			refresh_component_fragments(page)
			result = render_component_fragment(page, "static-instance")
			self.assertIn("static-instance", result["html"])
		finally:
			page.delete()
			component.delete()

	def test_fragment_is_not_created_when_component_reactivity_disabled(self):
		component = frappe.get_doc(
			{
				"doctype": "Builder Component",
				"component_name": f"Opt Out Component {frappe.generate_hash(length=5)}",
				"block": Block(element="div", blockId="opt-out-root").as_json(),
				"is_reactive": 0,
			}
		).insert()
		instance = Block(blockId="opt-out-instance", extendedFromComponent=component.name)
		page = frappe.get_doc(
			{
				"doctype": "Builder Page",
				"page_title": "Opt Out Fragment Test",
				"published": 1,
				"route": f"/opt-out-fragment-{frappe.generate_hash(length=6)}",
				"blocks": instance.as_json(wrap_in_array=True),
			}
		).insert()

		try:
			refresh_component_fragments(page)
			self.assertFalse(
				frappe.db.exists("Builder Page Fragment", {"page": page.name, "block_id": "opt-out-instance"})
			)
			with self.assertRaises(frappe.DoesNotExistError):
				render_component_fragment(page, "opt-out-instance")
		finally:
			page.delete()
			component.delete()

	def standard_prop(self, value):
		return {
			"isStandard": True,
			"isPassedDown": True,
			"value": value,
			"propOptions": {
				"type": "boolean" if isinstance(value, bool) else "string",
				"options": {"defaultValue": False if isinstance(value, bool) else ""},
			},
		}
