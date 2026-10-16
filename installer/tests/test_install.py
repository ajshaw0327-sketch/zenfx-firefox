import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('zenfx_install', Path(__file__).resolve().parents[1] / 'install.py')
setup = importlib.util.module_from_spec(spec); spec.loader.exec_module(setup)

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve(); self.profile = self.base/'profile'; self.profile.mkdir()
        (self.profile/'prefs.js').write_text('// Firefox fixture\n')
        (self.profile/'user.js').write_text('user_pref("keep.me", true);\n')
        (self.profile/'chrome').mkdir(); (self.profile/'chrome/userChrome.css').write_text('/* original theme */\n')
        self.app = self.base/'Firefox'; (self.app/'defaults/pref').mkdir(parents=True)
        (self.app/'application.ini').write_text('[App]\nVersion=158.0\n')
    def test_roundtrip_preserves_original_files(self):
        original = {n:(self.profile/n).read_bytes() for n in ['prefs.js','user.js','chrome/userChrome.css']}
        setup.install(self.profile,closed=True)
        self.assertIn('keep.me', (self.profile/'user.js').read_text())
        setup.uninstall(self.profile,closed=True)
        for n, data in original.items(): self.assertEqual((self.profile/n).read_bytes(),data)
        self.assertFalse((self.profile/'chrome/zenfx-installed').exists())
    def test_preview_writes_nothing(self):
        before = sorted(str(p.relative_to(self.base)) for p in self.base.rglob('*'))
        setup.install(self.profile,self.app,True,True)
        self.assertEqual(before, sorted(str(p.relative_to(self.base)) for p in self.base.rglob('*')))
    def test_requires_closed_confirmation(self):
        with self.assertRaises(ValueError): setup.install(self.profile)
    def test_wrong_profile_is_rejected(self):
        with self.assertRaises(ValueError): setup.install(self.base,closed=True)
    def test_existing_autoconfig_is_preserved(self):
        p=self.app/'defaults/pref/enterprise.js';p.write_text('pref("general.config.filename", "company.cfg");')
        with self.assertRaises(ValueError):setup.install(self.profile,self.app,True)
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
        self.assertIn('company.cfg',p.read_text())
    def test_newer_version_is_not_claimed_compatible(self):
        (self.app/'application.ini').write_text('[App]\nVersion=159.0\n')
        with self.assertRaises(ValueError):setup.install(self.profile,self.app,True)
    def test_existing_managed_directory_is_preserved(self):
        (self.profile/'chrome/zenfx-installed').mkdir()
        with self.assertRaises(ValueError):setup.install(self.profile,closed=True)
    def test_edits_after_install_block_restore(self):
        setup.install(self.profile,closed=True)
        p=self.profile/'chrome/userChrome.css';p.write_text('/* newer user change */')
        with self.assertRaises(ValueError):setup.uninstall(self.profile,closed=True)
        self.assertEqual(p.read_text(),'/* newer user change */')
    def test_shared_application_loader_is_retained(self):
        setup.install(self.profile,self.app,True)
        setup.uninstall(self.profile,closed=True)
        self.assertTrue((self.app/'zenfx.cfg').exists())
        self.assertFalse((self.profile/'chrome/zenfx-installed/enabled.json').exists())
    def test_destination_symlink_is_rejected(self):
        (self.profile/'chrome/userChrome.css').unlink()
        outside=self.base/'outside.css';outside.write_text('keep')
        (self.profile/'chrome/userChrome.css').symlink_to(outside)
        with self.assertRaises(ValueError):setup.install(self.profile,closed=True)
        self.assertEqual(outside.read_text(),'keep')
    def test_failure_rolls_back_originals(self):
        original=(self.profile/'user.js').read_bytes();write=Path.write_bytes
        def fail(path,data):
            if path.name=='enabled.json':raise OSError('simulated failure')
            return write(path,data)
        with patch.object(Path,'write_bytes',fail),self.assertRaises(OSError):setup.install(self.profile,closed=True)
        self.assertEqual((self.profile/'user.js').read_bytes(),original)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(),'/* original theme */\n')
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())

if __name__=='__main__':unittest.main()
