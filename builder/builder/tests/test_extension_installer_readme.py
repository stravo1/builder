import importlib.util
import pathlib
import tempfile

from frappe.tests.utils import FrappeTestCase

INSTALLER = pathlib.Path(__file__).parents[3] / "frontend" / "extension-sdk" / "install_extension.py"


def load_installer():
	spec = importlib.util.spec_from_file_location("install_extension", INSTALLER)
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


class TestInstallerReadme(FrappeTestCase):
	def setUp(self):
		temporary = tempfile.TemporaryDirectory()
		self.addCleanup(temporary.cleanup)
		self.directory = pathlib.Path(temporary.name)
		self.package = load_installer().ExtensionPackage(str(self.directory))

	def test_prefers_the_description_written_for_users(self):
		(self.directory / "README.md").write_text("Run npm install.")
		(self.directory / "DESCRIPTION.md").write_text("Pick an icon.")

		self.assertEqual(self.package.readme, "Pick an icon.")

	def test_falls_back_to_the_readme(self):
		(self.directory / "README.md").write_text("Run npm install.")

		self.assertEqual(self.package.readme, "Run npm install.")

	def test_has_no_page_without_either_file(self):
		self.assertIsNone(self.package.readme)
