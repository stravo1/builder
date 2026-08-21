"""Install every sample extension in this folder on a site.

Each sample is plain JavaScript under `src/`, so none of them needs a build.
`install_extension.py` does the work, once per folder.

Run it from the bench's sites directory:

    cd sites
    ../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost
    ../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost --uninstall
"""

import argparse
import pathlib
import sys

HERE = pathlib.Path(__file__).parent

# the installer these samples reuse sits one folder up, and is not on the path
sys.path.insert(0, str(HERE.parent))

from install_extension import ExtensionInstaller, ExtensionPackage  # noqa: E402


def sample_directories() -> list[pathlib.Path]:
	"""Every folder here that holds a manifest, so a new sample needs no edit."""
	return sorted(path.parent for path in HERE.glob("*/manifest.json"))


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("site", help="the site to install on, for example builder.localhost")
	parser.add_argument("--uninstall", action="store_true", help="remove the samples instead")
	arguments = parser.parse_args()

	for directory in sample_directories():
		installer = ExtensionInstaller(arguments.site, ExtensionPackage(directory))
		try:
			installer.uninstall() if arguments.uninstall else installer.install()
		except SystemExit as refusal:
			# one sample that needs a build should not stop the three that do not
			print(f"skipped {directory.name}: {refusal}")


if __name__ == "__main__":
	main()
