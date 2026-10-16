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
    def test_known_previous_loader_is_upgraded_and_backed_up(self):
        import json
        old = (setup.ROOT/'installer/legacy/zenfx-1.5.cfg').read_bytes()
        (self.app/'zenfx.cfg').write_bytes(old)
        (self.app/'defaults/pref/zenfx-autoconfig.js').write_bytes((setup.ROOT/'installer/zenfx-autoconfig.js').read_bytes())
        setup.install(self.profile,self.app,True)
        self.assertEqual((self.app/'zenfx.cfg').read_bytes(),(setup.ROOT/'installer/zenfx.cfg').read_bytes())
        state=json.loads((self.profile/'zenfx-install-state.json').read_text())
        record=next(r for r in state['files'] if Path(r['path'])==self.app/'zenfx.cfg')
        self.assertEqual(Path(record['backup']).read_bytes(),old)
        setup.uninstall(self.profile,closed=True)
        self.assertIn('zenfx-tab-hierarchy.uc.js',(self.app/'zenfx.cfg').read_text())
    def test_modified_previous_loader_is_preserved(self):
        old=(setup.ROOT/'installer/legacy/zenfx-1.5.cfg').read_bytes()+b'\n// User modification\n'
        (self.app/'zenfx.cfg').write_bytes(old)
        with self.assertRaises(ValueError):setup.install(self.profile,self.app,True)
        self.assertEqual((self.app/'zenfx.cfg').read_bytes(),old)
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
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
        original=(self.profile/'user.js').read_bytes();write=setup.atomic_write
        def fail(path,data):
            if path.name=='enabled.json':raise OSError('simulated failure')
            return write(path,data)
        with patch.object(setup,'atomic_write',fail),self.assertRaises(OSError):setup.install(self.profile,closed=True)
        self.assertEqual((self.profile/'user.js').read_bytes(),original)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(),'/* original theme */\n')
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
    def test_failed_install_can_be_retried(self):
        write = setup.atomic_write
        def fail(path, data):
            if path.name == 'enabled.json': raise OSError('simulated failure')
            return write(path, data)
        with patch.object(setup, 'atomic_write', fail), self.assertRaises(OSError):
            setup.install(self.profile, closed=True)
        setup.install(self.profile, closed=True)
        setup.uninstall(self.profile, closed=True)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(), '/* original theme */\n')
    def test_failed_restore_can_be_retried(self):
        setup.install(self.profile, closed=True)
        installed = (self.profile/'user.js').read_bytes()
        write = setup.atomic_write
        def fail(path, data):
            if path == self.profile/'user.js': raise OSError('restore failure')
            return write(path, data)
        with patch.object(setup, 'atomic_write', fail), self.assertRaises(OSError):
            setup.uninstall(self.profile, closed=True)
        self.assertEqual((self.profile/'user.js').read_bytes(), installed)
        self.assertTrue((self.profile/'chrome/zenfx-installed/enabled.json').exists())
        setup.uninstall(self.profile, closed=True)
        self.assertEqual((self.profile/'user.js').read_text(), 'user_pref("keep.me", true);\n')
    def test_failed_state_commit_leaves_no_half_install(self):
        write = setup.atomic_write
        def fail(path, data):
            if path.name == 'zenfx-install-state.json': raise OSError('state failure')
            return write(path, data)
        with patch.object(setup, 'atomic_write', fail), self.assertRaises(OSError):
            setup.install(self.profile, closed=True)
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
        self.assertFalse((self.profile/'chrome/zenfx-installed').exists())
        setup.install(self.profile, closed=True)
    def test_atomic_write_preserves_original_if_replace_fails(self):
        target = self.profile/'user.js'; before = target.read_bytes()
        with patch.object(Path, 'replace', side_effect=OSError('replace failed')), self.assertRaises(OSError):
            setup.atomic_write(target, b'new data')
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual(list(self.profile.glob('*.tmp')), [])

    def run_guided(self, answers):
        import io
        with patch('builtins.input', side_effect=answers), patch('sys.stdout', new_callable=io.StringIO):
            return setup.guided()
    def test_guided_default_installs_appearance_and_can_restore(self):
        result = self.run_guided(['', str(self.profile), 'yes', 'yes'])
        self.assertFalse(result['startup_loader'])
        self.assertFalse((self.app/'zenfx.cfg').exists())
        self.run_guided(['3', str(self.profile), 'yes', 'yes'])
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(), '/* original theme */\n')
    def test_guided_full_setup_requires_explicit_application(self):
        result = self.run_guided(['2', str(self.profile), str(self.app), 'yes', 'yes'])
        self.assertTrue(result['startup_loader'])
        self.assertTrue((self.app/'zenfx.cfg').exists())
    def test_guided_cancel_at_review_leaves_no_changes(self):
        before = {str(p): p.read_bytes() for p in self.base.rglob('*') if p.is_file()}
        self.assertIsNone(self.run_guided(['1', str(self.profile), 'yes', 'no']))
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.base.rglob('*') if p.is_file()})
    def test_guided_refuses_to_continue_while_browser_is_open(self):
        self.assertIsNone(self.run_guided(['1', str(self.profile), 'no']))
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
    def test_guided_empty_full_target_cannot_silently_install_appearance(self):
        with self.assertRaises(ValueError): self.run_guided(['2', str(self.profile), ''])
        self.assertFalse((self.profile/'zenfx-install-state.json').exists())
    @unittest.skipIf(setup.os.name == 'nt', 'Finder path syntax is macOS-specific')
    def test_guided_accepts_finder_paths_without_evaluating_shell_text(self):
        folder = self.base / 'Example Profile'; folder.mkdir()
        for value in [str(folder).replace(' ', r'\ '), '"' + str(folder) + '"', str(folder)]:
            with patch('builtins.input', return_value=value): self.assertEqual(setup.prompt_path(''), str(folder))
        literal = str(self.base / '$(touch BAD)')
        with patch('builtins.input', return_value="'" + literal + "'"): self.assertEqual(setup.prompt_path(''), literal)
        self.assertFalse((self.base / 'BAD').exists())

if __name__=='__main__':unittest.main()
