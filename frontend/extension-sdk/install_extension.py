"""Install a Builder extension for one user of a site.

An extension belongs to the person who installed it. They get their own copy of
the files and their own capabilities, and nobody else on the site sees it.

Builder has no install API yet, so an extension is installed by writing its files
and inserting the record. This script does both, for any extension directory.

Run it from the bench's sites directory:

    cd sites
    ../env/bin/python /path/to/install_extension.py builder.localhost /path/to/my-extension
    ../env/bin/python /path/to/install_extension.py builder.localhost /path/to/my-extension --user alice@example.com
    ../env/bin/python /path/to/install_extension.py builder.localhost /path/to/my-extension --uninstall

Run it again after every build. The checksum keys the editor's frame, so a new
one remounts the extension and a reload picks the change up.
"""

import argparse
import hashlib
import pathlib
import shutil

import frappe

# An SFC needs compiling, so a source install leaves one behind. A frame cannot
# import one, and nothing else reads it.
NOT_SHIPPED_SUFFIXES = {".vue"}

INSTALLATION_DOCTYPE = "Builder User Extension"

# What a single-file build leaves behind, beside the icon the manifest names.
INSTALLABLE_FILES = {"main.js", "manifest.json"}


class ExtensionPackage:
	"""What an author builds: a manifest, and the files a frame loads."""

	def __init__(self, directory: str):
		self.directory = pathlib.Path(directory).resolve()

	@property
	def manifest(self) -> dict:
		path = self.directory / "manifest.json"
		if not path.is_file():
			raise SystemExit(f"no manifest.json in {self.directory}")
		return frappe.parse_json(path.read_text())

	@property
	def source_directory(self) -> pathlib.Path:
		"""`dist` after a build, `src` otherwise.

		Both are real installs. A build is what an author ships, and plain
		JavaScript under `src` runs an extension that needs no build step at all.
		"""
		built = self.directory / "dist"
		return built if built.is_dir() else self.directory / "src"

	@property
	def files(self) -> list[pathlib.Path]:
		"""Every file that belongs in the install directory, in a stable order."""
		return sorted(
			path
			for path in self.source_directory.rglob("*")
			if path.is_file() and path.suffix not in NOT_SHIPPED_SUFFIXES
		)

	@property
	def checksum(self) -> str:
		"""Of the names and the contents, so a rename busts the cache as a rewrite does."""
		digest = hashlib.sha256()
		for path in self.files:
			digest.update(path.relative_to(self.source_directory).as_posix().encode())
			digest.update(path.read_bytes())
		return digest.hexdigest()[:12]

	@property
	def needs_a_build(self) -> bool:
		"""True when `src` holds a file no browser can import.

		A source install copies `src` as it stands. An SFC is dropped on the way,
		and the module that imported it then fails inside a sandboxed frame, with
		nothing printed anywhere. Better to refuse and name the build.
		"""
		if (self.directory / "dist").is_dir():
			return False
		return any(path.suffix in NOT_SHIPPED_SUFFIXES for path in self.source_directory.rglob("*"))

	def validate(self):
		if not self.source_directory.is_dir():
			raise SystemExit(f"no dist/ or src/ in {self.directory}")
		if not self.files:
			raise SystemExit(f"nothing to install in {self.source_directory}")
		if self.needs_a_build:
			raise SystemExit(
				f"{self.directory} holds components that need compiling. "
				f"Run the build in that directory first, then install dist/."
			)
		for field in ("name", "version"):
			if not self.manifest.get(field):
				raise SystemExit(f'manifest.json has no "{field}"')
		self.validate_one_file()

	def validate_one_file(self):
		"""A built extension is main.js, its manifest, and an icon. Nothing else.

		The editor reads main.js and posts the code into a frame, so a relative
		import inside it resolves against nothing and an asset URL points nowhere.
		The build plugin refuses such a build too. This catches a directory built
		before that rule, or assembled by hand.
		"""
		allowed = set(INSTALLABLE_FILES)
		if self.manifest.get("icon"):
			allowed.add(self.manifest["icon"])

		listed = {str(path.relative_to(self.source_directory)) for path in self.files}
		extra = sorted(listed - allowed)
		if extra:
			raise SystemExit(
				f"an extension has to install as one file, and {self.source_directory} also holds "
				f"{', '.join(extra)}. Build it with the current extension SDK."
			)


class ExtensionInstaller:
	def __init__(self, site: str, package: ExtensionPackage, user: str):
		self.site = site
		self.package = package
		self.user = user
		frappe.init(site=site)
		frappe.connect()

	def install(self):
		self.package.validate()
		self.assert_user()
		installation = self.upsert_installation()
		self.copy_files(installation.install_path)
		frappe.db.commit()
		self.report(installation)

	def assert_user(self):
		if not frappe.db.exists("User", self.user):
			raise SystemExit(f"no user called {self.user} on {self.site}")

	@property
	def installation(self) -> str | None:
		"""This user's installation of this extension. Another user's is another record."""
		return frappe.db.get_value(
			INSTALLATION_DOCTYPE,
			{"user": self.user, "extension": self.package.manifest["name"]},
			"name",
		)

	def upsert_installation(self):
		manifest = self.package.manifest
		values = {
			"label": manifest.get("label"),
			"description": manifest.get("description"),
			"icon": manifest.get("icon"),
			"version": manifest["version"],
			"granted_capabilities": frappe.as_json(manifest.get("capabilities") or []),
			"checksum": self.package.checksum,
			"enabled": 1,
		}
		existing = self.installation
		if existing:
			return frappe.get_doc(INSTALLATION_DOCTYPE, existing).update(values).save()

		return frappe.get_doc(
			{
				"doctype": INSTALLATION_DOCTYPE,
				"user": self.user,
				"extension": manifest["name"],
				**values,
			}
		).insert()

	def copy_files(self, install_path: str):
		"""The whole directory, into the copy this one user runs.

		The source directory flattens onto the install root, so `main.js` sits where
		the editor reads it from.
		"""
		shutil.rmtree(install_path, ignore_errors=True)
		for path in self.package.files:
			target = pathlib.Path(install_path) / path.relative_to(self.package.source_directory)
			target.parent.mkdir(parents=True, exist_ok=True)
			shutil.copy2(path, target)

	def uninstall(self):
		"""Removes one user's installation, and nothing the extension made.

		`on_trash` takes that user's files, grants and stored state. A doctype holds
		the site's data, a token styles every page, and a client script runs for
		every visitor, so all three stay. An administrator removes those in Desk
		after deciding nothing needs them.
		"""
		extension = self.package.manifest["name"]
		existing = self.installation
		if not existing:
			print(f"{extension} is not installed for {self.user}")
			return

		frappe.delete_doc(INSTALLATION_DOCTYPE, existing)
		frappe.db.commit()
		print(f"uninstalled {extension} for {self.user}")
		self.report_what_stays(extension)

	def report_what_stays(self, extension: str):
		"""Names what the site keeps, so nobody hunts for it in the editor."""
		tokens = frappe.db.count("Builder Token", {"extension": extension})
		resources = frappe.db.count("Builder Extension Resource", {"extension": extension})
		others = frappe.db.count(INSTALLATION_DOCTYPE, {"extension": extension})

		if tokens or resources:
			print(f"  kept   {tokens} token(s) and {resources} resource(s) this extension made")
		if others:
			print(f"  note   {others} other user(s) still have it installed")

	def report(self, installation):
		print(f"installed {installation.extension} for {self.user} at checksum {installation.checksum}")
		print(f"  files  {installation.install_path}")
		print(f"  from   {self.package.source_directory.name}/")


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("site", help="the site to install on, for example builder.localhost")
	parser.add_argument("directory", help="the extension directory, which holds manifest.json")
	parser.add_argument(
		"--user",
		default="Administrator",
		help="who to install for, because an extension belongs to one user",
	)
	parser.add_argument("--uninstall", action="store_true", help="remove the extension instead")
	arguments = parser.parse_args()

	package = ExtensionPackage(arguments.directory)
	installer = ExtensionInstaller(arguments.site, package, arguments.user)
	installer.uninstall() if arguments.uninstall else installer.install()


if __name__ == "__main__":
	main()
