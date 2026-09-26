# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

from unittest.mock import Mock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from builder.builder.tests.extension_fixtures import drop_installations, make_installation
from builder.extensions.constants import ENTRY_FILE
from builder.extensions.hub import Release, apply_release, run_hub_install, run_hub_update, update_from_hub
from builder.extensions.package import ValidatedPackage

EXTENSION = "acme/hub-install"
ASKED = ["page.write", "data.access", "page.edit"]
HUB_URL = "https://hub.example.com"

RELEASE = Release(
	name=EXTENSION,
	version="1.2.0",
	protocol_version=1,
	manifest={},
	package_url="https://example.com/package.builderext",
	package_size=10,
	package_sha256="a" * 64,
	status="Published",
)
PACKAGE = ValidatedPackage(
	manifest={"label": "Hub Install", "description": "A test extension.", "capabilities": ASKED},
	files={ENTRY_FILE: b"export {}"},
)


class TestApplyRelease(FrappeTestCase):
	"""What the install job writes once the package checks pass."""

	def setUp(self):
		drop_installations(EXTENSION)
		self.addCleanup(drop_installations, EXTENSION)
		self.installation = make_installation(
			EXTENSION, capabilities=[], install_state="Installing", enabled=0
		)

	def apply(self, capabilities: list[str]):
		apply_release(self.installation, HUB_URL, RELEASE, PACKAGE, capabilities)
		return frappe.get_doc("Builder User Extension", self.installation.name)

	def test_grants_what_the_user_allowed_at_install(self):
		installed = self.apply(["page.write", "page.edit"])
		self.assertEqual(installed.requested, ASKED)
		self.assertEqual(installed.capabilities, ["page.write", "page.edit"])

	def test_grants_nothing_when_the_user_allowed_nothing(self):
		self.assertEqual(self.apply([]).capabilities, [])

	def test_maps_a_legacy_manifest_to_todays_keys(self):
		"""A release published before the keys changed still installs with what it meant."""
		legacy = ValidatedPackage(
			manifest={**PACKAGE.manifest, "capabilities": ["block.update", "context.read", "block.insert"]},
			files=PACKAGE.files,
		)
		apply_release(self.installation, HUB_URL, RELEASE, legacy, ["page.edit"])

		installed = frappe.get_doc("Builder User Extension", self.installation.name)
		self.assertEqual((installed.requested, installed.capabilities), (["page.edit"], ["page.edit"]))

	def test_drops_a_capability_the_manifest_never_asked_for(self):
		self.assertEqual(self.apply(["page.write", "token.write"]).capabilities, ["page.write"])


class TestRunHubInstall(FrappeTestCase):
	"""What the install job reports when it ends.

	The job rolls back and commits, so the row it works on is committed first.
	"""

	def setUp(self):
		drop_installations(EXTENSION)
		self.installation = make_installation(
			EXTENSION, capabilities=[], install_state="Installing", enabled=0
		).name
		frappe.db.commit()
		self.addCleanup(self.drop_committed)

	def drop_committed(self):
		drop_installations(EXTENSION)
		frappe.db.commit()

	def run_job(self, get_release: Mock):
		with (
			patch("builder.extensions.hub.get_release", get_release),
			patch("builder.extensions.hub.download_package"),
			patch("builder.extensions.hub.validate_package", return_value=PACKAGE),
			patch("frappe.publish_realtime") as publish,
			patch("frappe.log_error") as log_error,
		):
			run_hub_install(self.installation, EXTENSION, "1.2.0", HUB_URL, frappe.session.user, ASKED)
		return publish, log_error

	def test_a_cancelled_install_ends_without_a_word(self):
		self.drop_committed()
		publish, log_error = self.run_job(Mock(return_value=RELEASE))
		publish.assert_not_called()
		log_error.assert_not_called()

	def test_a_finished_install_turns_the_extension_on(self):
		self.run_job(Mock(return_value=RELEASE))
		self.assertEqual(frappe.db.get_value("Builder User Extension", self.installation, "enabled"), 1)

	def test_a_failed_install_marks_the_row_and_says_so(self):
		publish, log_error = self.run_job(Mock(side_effect=Exception("The Hub is down.")))
		state = frappe.db.get_value(
			"Builder User Extension", self.installation, ["install_state", "install_error"]
		)
		self.assertEqual(state, ("Failed", "The Hub is down."))
		log_error.assert_called_once()
		publish.assert_called_once_with(
			"builder_extension_install",
			{"extension": EXTENSION, "state": "Failed"},
			user=frappe.session.user,
			after_commit=True,
		)


class TestRunHubUpdate(FrappeTestCase):
	"""What the update job keeps, adds and leaves alone.

	The installed version asked for page.write, data.access and token.write, and the
	user allowed page.write only. The new release asks for page.write,
	data.access and page.edit, so page.edit is the one new ask.
	"""

	def setUp(self):
		drop_installations(EXTENSION)
		self.installation = make_installation(
			EXTENSION,
			capabilities=["page.write", "data.access", "token.write"],
			granted=["page.write"],
			source_url=HUB_URL,
			install_state="Ready",
			enabled=0,
		).name
		frappe.db.commit()
		self.addCleanup(self.drop_committed)

	def drop_committed(self):
		drop_installations(EXTENSION)
		frappe.db.commit()

	def run_job(self, get_release: Mock, allowed: list[str]):
		with (
			patch("builder.extensions.hub.get_release", get_release),
			patch("builder.extensions.hub.download_package"),
			patch("builder.extensions.hub.validate_package", return_value=PACKAGE),
			patch("frappe.publish_realtime") as publish,
			patch("frappe.log_error"),
		):
			run_hub_update(
				self.installation,
				EXTENSION,
				"1.2.0",
				HUB_URL,
				{"readme": "# New"},
				frappe.session.user,
				allowed,
			)
		return publish, frappe.get_doc("Builder User Extension", self.installation)

	def test_keeps_old_answers_and_adds_only_what_the_user_allowed(self):
		_, updated = self.run_job(Mock(return_value=RELEASE), ["data.access", "page.edit"])
		self.assertEqual(updated.requested, ASKED)
		# data.access was refused before, so the update does not grant it again
		self.assertEqual(updated.capabilities, ["page.write", "page.edit"])
		self.assertEqual((updated.version, updated.readme), ("1.2.0", "# New"))

	def test_leaves_a_disabled_extension_disabled(self):
		_, updated = self.run_job(Mock(return_value=RELEASE), [])
		self.assertEqual(updated.enabled, 0)

	def test_a_failed_update_keeps_the_old_version_and_says_why(self):
		publish, kept = self.run_job(Mock(side_effect=Exception("The Hub is down.")), ["page.edit"])
		self.assertEqual((kept.version, kept.install_state), ("1.0.0", "Ready"))
		self.assertEqual(kept.capabilities, ["page.write"])
		publish.assert_called_once_with(
			"builder_extension_update",
			{"extension": EXTENSION, "error": "The Hub is down."},
			user=frappe.session.user,
			after_commit=True,
		)


class TestUpdateFromHub(FrappeTestCase):
	"""What the request refuses before any job is queued."""

	def setUp(self):
		drop_installations(EXTENSION)
		self.addCleanup(drop_installations, EXTENSION)

	def request(self, latest: str):
		listing = {"extension": {}, "releases": [{"version": latest}]}
		with (
			patch("builder.extensions.hub.resolve_hub_url", return_value=HUB_URL),
			patch("builder.extensions.hub.hub_extension", return_value=listing),
			patch("frappe.enqueue") as enqueue,
		):
			update_from_hub(EXTENSION, [])
		return enqueue

	def test_queues_an_update_to_a_newer_release(self):
		make_installation(EXTENSION, source_url=HUB_URL, install_state="Ready")
		self.assertEqual(self.request("1.2.0").call_args.kwargs["version"], "1.2.0")

	def test_refuses_an_install_that_is_already_the_latest(self):
		make_installation(EXTENSION, source_url=HUB_URL, install_state="Ready")
		with self.assertRaisesRegex(frappe.ValidationError, "already"):
			self.request("1.0.0")

	def test_refuses_a_directory_install(self):
		make_installation(EXTENSION, install_state="Ready")
		with self.assertRaisesRegex(frappe.ValidationError, "Builder Hub"):
			self.request("1.2.0")
