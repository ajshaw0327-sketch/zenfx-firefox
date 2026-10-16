import importlib.util
import json
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

    def age_installation(self, full=False, legacy=False):
        setup.install(self.profile, self.app if full else None, closed=True)
        state_path = self.profile/'zenfx-install-state.json'
        state = json.loads(state_path.read_text())
        for record in state['files']:
            path = Path(record['path'])
            if path.name in ('userChrome.css', 'zenfx-newtab-overlay.uc.js') and path.parent.name == 'zenfx-installed':
                path.write_bytes(b'/* previous shipped version */\n')
                record['installed_hash'] = setup.digest(path.read_bytes())
            if legacy and path == self.profile/'chrome/userChrome.css':
                path.write_text(setup.OLD_ENTRY)
                record['installed_hash'] = setup.digest(path.read_bytes())
        if legacy:
            (self.profile/'chrome/zenfx-custom.css').unlink()
            state['files'] = [r for r in state['files'] if not r.get('user_owned')]
        state_path.write_text(json.dumps(state, indent=2)+'\n')
        return state

    def snapshot(self):
        return {str(p.relative_to(self.base)): p.read_bytes() for p in self.base.rglob('*') if p.is_file()}

    def test_update_preserves_settings_custom_css_and_application(self):
        self.age_installation(full=True)
        (self.profile/'user.js').write_text('user_pref("zenfx.compact.shortcut", "custom");\n')
        custom=self.profile/'chrome/zenfx-custom.css';custom.write_text(':root { --zenfx-content-radius: 9px; }')
        before={p:p.read_bytes() for p in [self.profile/'prefs.js',self.profile/'user.js',custom,self.app/'zenfx.cfg',self.app/'defaults/pref/zenfx-autoconfig.js']}
        result=setup.update(self.profile,closed=True)
        self.assertEqual(result['action'],'updated')
        for p,data in before.items():
            self.assertEqual(p.read_bytes(),setup.session_restore_settings(data) if p==self.profile/'user.js' else data)
        self.assertEqual((self.profile/'chrome/zenfx-installed/userChrome.css').read_bytes(),(setup.ROOT/'standalone/userChrome.css').read_bytes())
        self.assertEqual((self.profile/'chrome/zenfx-installed/zenfx-newtab-overlay.uc.js').read_bytes(),(setup.ROOT/'optional-chrome/zenfx-newtab-overlay.uc.js').read_bytes())

    def test_update_keeps_initial_uninstall_backups(self):
        originals={p:p.read_bytes() for p in [self.profile/'user.js',self.profile/'chrome/userChrome.css']}
        initial=self.age_installation()
        setup.update(self.profile,closed=True)
        state=json.loads((self.profile/'zenfx-install-state.json').read_text())
        self.assertEqual(state['backup'],initial['backup'])
        self.assertNotEqual(state['last_update_backup'],state['backup'])
        custom=self.profile/'chrome/zenfx-custom.css';custom.write_text('/* keep my CSS */')
        setup.uninstall(self.profile,closed=True)
        for p,data in originals.items():self.assertEqual(p.read_bytes(),data)
        self.assertEqual(custom.read_text(),'/* keep my CSS */')

    def test_update_preview_and_current_version_make_no_writes(self):
        self.age_installation();before=self.snapshot()
        self.assertTrue(setup.update(self.profile,closed=True,dry_run=True)['files'])
        self.assertEqual(self.snapshot(),before)
        setup.update(self.profile,closed=True);before=self.snapshot()
        self.assertEqual(setup.update(self.profile,closed=True)['action'],'up-to-date')
        self.assertEqual(self.snapshot(),before)

    def test_update_requires_closed_confirmation_and_managed_install(self):
        with self.assertRaises(ValueError):setup.update(self.profile)
        with self.assertRaisesRegex(ValueError,'No managed'):setup.update(self.profile,closed=True)

    def test_update_migrates_old_entry_and_preserves_original_restore(self):
        self.age_installation(legacy=True)
        setup.update(self.profile,closed=True)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(),setup.ENTRY)
        self.assertTrue((self.profile/'chrome/zenfx-custom.css').exists())
        setup.uninstall(self.profile,closed=True)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(),'/* original theme */\n')

    def test_update_preserves_edited_entry(self):
        self.age_installation();p=self.profile/'chrome/userChrome.css'
        p.write_text(setup.ENTRY+'/* my entry customization */')
        setup.update(self.profile,closed=True)
        self.assertEqual(p.read_text(),setup.ENTRY+'/* my entry customization */')

    def test_update_preserves_preexisting_custom_file(self):
        custom=self.profile/'chrome/zenfx-custom.css';custom.write_text('/* existing overrides */')
        self.age_installation();setup.update(self.profile,closed=True)
        self.assertEqual(custom.read_text(),'/* existing overrides */')
        setup.uninstall(self.profile,closed=True)
        self.assertEqual(custom.read_text(),'/* existing overrides */')

    def test_update_refuses_edited_managed_file_before_any_writes(self):
        self.age_installation();p=self.profile/'chrome/zenfx-installed/userChrome.css';p.write_text('/* user edit */')
        before=self.snapshot()
        with self.assertRaisesRegex(ValueError,'custom edits'):setup.update(self.profile,closed=True)
        self.assertEqual(self.snapshot(),before)

    def test_update_repairs_missing_managed_file(self):
        self.age_installation();p=self.profile/'chrome/zenfx-installed/zenfx-drag-to-split.uc.js';p.unlink()
        setup.update(self.profile,closed=True)
        self.assertEqual(p.read_bytes(),(setup.ROOT/'optional-chrome'/p.name).read_bytes())

    def test_update_failure_and_state_failure_roll_back_and_retry(self):
        self.age_installation(legacy=True)
        files=[self.profile/'chrome/zenfx-installed/userChrome.css',self.profile/'chrome/zenfx-installed/zenfx-newtab-overlay.uc.js',self.profile/'chrome/userChrome.css',self.profile/'zenfx-install-state.json']
        before={p:p.read_bytes() for p in files};write=setup.atomic_write
        for failed in [self.profile/'chrome/zenfx-installed/zenfx-newtab-overlay.uc.js',self.profile/'zenfx-install-state.json']:
            def fail(path,data):
                if path==failed:raise OSError('update failure')
                return write(path,data)
            with patch.object(setup,'atomic_write',fail),self.assertRaises(OSError):setup.update(self.profile,closed=True)
            for p,data in before.items():self.assertEqual(p.read_bytes(),data)
            self.assertFalse((self.profile/'chrome/zenfx-custom.css').exists())
        setup.update(self.profile,closed=True);setup.uninstall(self.profile,closed=True)
        self.assertEqual((self.profile/'chrome/userChrome.css').read_text(),'/* original theme */\n')

    def test_update_never_rewrites_or_repairs_application_files(self):
        self.age_installation(full=True);p=self.app/'zenfx.cfg';p.unlink()
        setup.update(self.profile,closed=True)
        self.assertFalse(p.exists())

    def test_update_rejects_untracked_collision_and_symlink(self):
        self.age_installation();p=self.profile/'chrome/zenfx-installed/zenfx-newtab-overlay.uc.js'
        state_path=self.profile/'zenfx-install-state.json';state=json.loads(state_path.read_text())
        state['files']=[r for r in state['files'] if Path(r['path'])!=p];state_path.write_text(json.dumps(state))
        before=self.snapshot()
        with self.assertRaises(ValueError):setup.update(self.profile,closed=True)
        self.assertEqual(self.snapshot(),before)
        p.unlink();outside=self.base/'outside.js';outside.write_text('keep');p.symlink_to(outside)
        with self.assertRaisesRegex(ValueError,'symbolic link'):setup.update(self.profile,closed=True)
        self.assertEqual(outside.read_text(),'keep')

    def test_update_rejects_unexpected_state_paths(self):
        self.age_installation();p=self.profile/'zenfx-install-state.json';state=json.loads(p.read_text())
        state['files'][0]['path']=str(self.base/'outside.css');p.write_text(json.dumps(state))
        before=self.snapshot()
        with self.assertRaisesRegex(ValueError,'Unexpected path'):setup.update(self.profile,closed=True)
        self.assertEqual(self.snapshot(),before)

    def test_install_enables_native_previous_session_restore(self):
        (self.profile/'user.js').write_bytes(b'user_pref("browser.startup.page", 1);\r\nuser_pref("keep.me", true);\r\n')
        setup.install(self.profile,closed=True)
        data=(self.profile/'user.js').read_bytes()
        self.assertTrue(data.endswith(setup.RESTORE_BLOCK))
        self.assertIn(b'user_pref("keep.me", true);',data)

    def test_update_migrates_session_restore_and_keeps_later_user_edits_on_uninstall(self):
        self.age_installation();p=self.profile/'user.js'
        state_path=self.profile/'zenfx-install-state.json';state=json.loads(state_path.read_text())
        previous=setup.without_block(p.read_bytes(),setup.RESTORE_BEGIN,setup.RESTORE_END)
        p.write_bytes(previous)
        next(r for r in state['files'] if Path(r['path'])==p)['installed_hash']=setup.digest(previous)
        state_path.write_text(json.dumps(state))
        added=b'user_pref("my.later.setting", "keep this");\r\nuser_pref("browser.startup.page", 1);\r\n'
        p.write_bytes(previous+added)
        setup.update(self.profile,closed=True)
        self.assertEqual(p.read_bytes(),previous+added+setup.RESTORE_BLOCK)
        setup.uninstall(self.profile,closed=True)
        self.assertIn(added,p.read_bytes())
        self.assertNotIn(setup.BEGIN.encode(),p.read_bytes())
        self.assertNotIn(setup.RESTORE_BEGIN,p.read_bytes())

    def test_restore_settings_update_is_idempotent_and_does_not_change_privacy_prefs(self):
        data=b'user_pref("privacy.sanitize.sanitizeOnShutdown", true);\r\nuser_pref("browser.privatebrowsing.autostart", true);\r\n'
        result=setup.session_restore_settings(data)
        self.assertTrue(result.startswith(data))
        self.assertEqual(setup.session_restore_settings(result),result)
        moved=setup.session_restore_settings(result+b'user_pref("unrelated", false);\n')
        self.assertEqual(moved.count(setup.RESTORE_BEGIN),1)
        self.assertTrue(moved.endswith(setup.RESTORE_BLOCK))

    def test_update_session_pref_failure_rolls_back_original_user_settings(self):
        self.age_installation();p=self.profile/'user.js'
        prior=b'user_pref("my.custom.setting", true);\n';p.write_bytes(prior)
        state_path=self.profile/'zenfx-install-state.json';before=state_path.read_bytes();write=setup.atomic_write
        def fail(path,data):
            if path==state_path:raise OSError('state commit failed')
            return write(path,data)
        with patch.object(setup,'atomic_write',fail),self.assertRaises(OSError):setup.update(self.profile,closed=True)
        self.assertEqual(p.read_bytes(),prior)
        self.assertEqual(state_path.read_bytes(),before)

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
    def test_guided_update_requires_no_application_and_can_cancel(self):
        self.age_installation(full=True);before=self.snapshot()
        self.assertIsNone(self.run_guided(['4',str(self.profile),'yes','no']))
        self.assertEqual(self.snapshot(),before)
        result=self.run_guided(['4',str(self.profile),'yes','yes'])
        self.assertEqual(result['action'],'updated')
        self.assertEqual(self.run_guided(['4',str(self.profile),'yes'])['action'],'up-to-date')
    @unittest.skipIf(setup.os.name == 'nt', 'Finder path syntax is macOS-specific')
    def test_guided_accepts_finder_paths_without_evaluating_shell_text(self):
        folder = self.base / 'Example Profile'; folder.mkdir()
        for value in [str(folder).replace(' ', r'\ '), '"' + str(folder) + '"', str(folder)]:
            with patch('builtins.input', return_value=value): self.assertEqual(setup.prompt_path(''), str(folder))
        literal = str(self.base / '$(touch BAD)')
        with patch('builtins.input', return_value="'" + literal + "'"): self.assertEqual(setup.prompt_path(''), literal)
        self.assertFalse((self.base / 'BAD').exists())

if __name__=='__main__':unittest.main()
