from pathlib import Path
import re


def nav_html(active: str) -> str:
    def link(key: str, href: str, label: str, extra: str = "") -> str:
        current = ' aria-current="page" class="is-active"' if active == key else ''
        attrs = f' {extra.strip()}' if extra.strip() else ''
        return f'<a{current}{attrs} href="{href}">{label}</a>'

    return (
        '<nav aria-label="Primary navigation" class="site-nav" id="site-nav">'
        + link('feed', 'index.html', 'Feed')
        + link('profile', 'members.html', 'Profile', 'data-my-profile')
        + link('free-tools', 'free-tools.html', 'FREE TOOLS')
        + link('post', 'community.html', 'Post')
        + link('members', 'members.html', 'Members')
        + link('messages', 'messages.html', 'Messages', 'data-auth-only hidden')
        + link('settings', 'profile-settings.html', 'Settings', 'data-auth-only hidden')
        + '<a data-signed-out-only href="signin.html?next=members.html">Sign in</a>'
        + '</nav>'
    )


pages = {
    'profile.html': 'profile',
    'free-tools.html': 'free-tools',
    'community.html': 'post',
    'members.html': 'members',
    'messages.html': 'messages',
    'profile-settings.html': 'settings',
}

for filename, active in pages.items():
    path = Path(filename)
    html = path.read_text(encoding='utf-8')
    html2, count = re.subn(
        r'<nav aria-label="Primary navigation" class="site-nav" id="site-nav">.*?</nav>',
        nav_html(active),
        html,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError(f'Could not replace primary nav in {filename}')

    html2 = re.sub(r'site\.js\?v=\d+', 'site.js?v=30', html2)
    if filename == 'profile.html':
        html2 = re.sub(r'member-profile\.js\?v=\d+', 'member-profile.js?v=29', html2)
    elif filename == 'community.html':
        html2 = re.sub(r'community\.js\?v=\d+', 'community.js?v=14', html2)
    elif filename == 'profile-settings.html':
        html2 = re.sub(r'profile-settings\.js\?v=\d+', 'profile-settings.js?v=29', html2)

    path.write_text(html2, encoding='utf-8')
    print('NAV:', filename)

# Homepage cleanup and viewer-owned profile routing.
index = Path('index.html')
html = index.read_text(encoding='utf-8')
top_actions = '''<nav aria-label="Quick actions" class="social-top-actions">
<a href="index.html">Feed</a>
<a data-my-profile href="members.html">Profile</a>
<a href="free-tools.html">FREE TOOLS</a>
<a href="community.html">Post</a>
<a href="members.html">Members</a>
<a data-auth-only hidden href="messages.html">Messages</a>
<a data-auth-only hidden href="profile-settings.html">Settings</a>
<a data-signed-out-only href="signin.html?next=members.html">Sign in</a>
</nav>'''
html, count = re.subn(
    r'<nav aria-label="Quick actions" class="social-top-actions">.*?</nav>',
    top_actions,
    html,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError('Could not replace homepage top actions')

html = html.replace(
    '<a href="profile.html?handle=0pticbox"><span aria-hidden="true">◎</span><b>0PTICBOX</b></a>',
    '<a data-my-profile href="members.html"><span aria-hidden="true">◎</span><b>Profile</b></a>',
)
html = html.replace(
    '<a href="profile.html?handle=0pticbox"><span>◎</span><small>0PTICBOX</small></a>',
    '<a data-my-profile href="members.html"><span>◎</span><small>Profile</small></a>',
)
html, main_count = re.subn(
    r'\n<section class="social-side-card hub-about-card">.*?</section>',
    '',
    html,
    count=1,
    flags=re.S,
)
html, explore_count = re.subn(
    r'\n<section class="social-side-card">\s*<h2>Explore</h2>.*?</section>',
    '',
    html,
    count=1,
    flags=re.S,
)
if main_count != 1 or explore_count != 1:
    raise RuntimeError(f'Homepage cleanup mismatch main={main_count} explore={explore_count}')
html = re.sub(r'site\.js\?v=\d+', 'site.js?v=30', html)
index.write_text(html, encoding='utf-8')
print('CLEANED: index.html')

# Shared auth navigation: profile links resolve to the signed-in viewer.
auth_path = Path('auth-state.js')
js = auth_path.read_text(encoding='utf-8')
needle = "const signedOutOnly = [...document.querySelectorAll('[data-signed-out-only]')];\n"
if 'const myProfileLinks' not in js:
    if needle not in js:
        raise RuntimeError('auth-state insertion point missing')
    replacement = needle + "const myProfileLinks = [...document.querySelectorAll('[data-my-profile]')];\n\nfunction updateMyProfileLinks(session) {\n  const id = session?.user?.id || '';\n  const href = id ? `profile.html?id=${encodeURIComponent(id)}` : 'members.html';\n  myProfileLinks.forEach((link) => { link.href = href; });\n}\n"
    js = js.replace(needle, replacement, 1)
if 'updateMyProfileLinks(null);' not in js:
    js = js.replace('showSignedInUi(false);', 'showSignedInUi(false);\nupdateMyProfileLinks(null);', 1)
if 'updateMyProfileLinks(session);' not in js:
    js = js.replace(
        '    const signedIn = Boolean(session?.user);\n    showSignedInUi(signedIn);',
        '    const signedIn = Boolean(session?.user);\n    showSignedInUi(signedIn);\n    updateMyProfileLinks(session);',
        1,
    )
auth_path.write_text(js, encoding='utf-8')
print('UPDATED: auth-state.js')

# Cache-bust the imported auth module.
site_path = Path('site.js')
js = site_path.read_text(encoding='utf-8')
js = js.replace("import('./auth-state.js').catch", "import('./auth-state.js?v=20260816-2').catch", 1)
site_path.write_text(js, encoding='utf-8')
print('UPDATED: site.js')

# Instagram is opt-in only.
member_path = Path('member-profile.js')
js = member_path.read_text(encoding='utf-8')
old = "  if (!instagramUrl && !imageUrl) {\n    section.hidden = true;\n    return;\n  }"
new = "  if (!instagramUrl) {\n    section.hidden = true;\n    return;\n  }"
if old in js:
    js = js.replace(old, new, 1)
elif new not in js:
    raise RuntimeError('Instagram visibility block missing')
js = js.replace(
    '  const instagram = socialCount(profile.instagram_followers);',
    "  const instagram = safeHttpUrl(profile.instagram_url) ? socialCount(profile.instagram_followers) : null;",
    1,
)
member_path.write_text(js, encoding='utf-8')
print('UPDATED: member-profile.js')

# Add account deletion danger zone.
settings_path = Path('profile-settings.html')
html = settings_path.read_text(encoding='utf-8')
if 'id="settings-delete-account"' not in html:
    marker = '<div class="settings-actions"><button class="retro-button primary" type="submit">Save settings</button>'
    if marker not in html:
        raise RuntimeError('Settings actions marker missing')
    danger = '''<fieldset class="settings-group settings-danger-zone"><legend>Danger zone</legend>
<div class="settings-field"><strong>Delete account</strong><p>Delete this network account, its profile, posts, reviews, friendships, and messages. This cannot be undone.</p><button class="retro-button danger" id="settings-delete-account" type="button">Delete my account</button><small>Owner/admin accounts are protected and cannot be deleted from this screen.</small></div>
</fieldset>
'''
    html = html.replace(marker, danger + marker, 1)
settings_path.write_text(html, encoding='utf-8')
print('UPDATED: profile-settings.html danger zone')

settings_js_path = Path('profile-settings.js')
js = settings_js_path.read_text(encoding='utf-8')
if "settings-delete-account')?.addEventListener" not in js:
    signout = "$('settings-signout').addEventListener('click', async () => { if (!supabase) return; await supabase.auth.signOut(); window.location.replace('signin.html'); });"
    if signout not in js:
        raise RuntimeError('Signout handler marker missing')
    deletion = '''$('settings-delete-account')?.addEventListener('click', async () => {
  if (!supabase || !user) return;
  const button = $('settings-delete-account');
  if (!window.confirm('Delete this account permanently? Your profile, posts, reviews, friendships, and messages will be removed.')) return;
  const typed = window.prompt('Type DELETE to confirm permanent account deletion.');
  if (typed !== 'DELETE') return setMessage('Account deletion cancelled.');
  button.disabled = true;
  setMessage('Deleting account…');
  try {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    await supabase.auth.signOut();
    window.location.replace('index.html');
  } catch (error) {
    const missingRpc = /delete_my_account|function .* does not exist|schema cache/i.test(String(error?.message || ''));
    setMessage(missingRpc ? 'Account deletion needs the newest Supabase account-cleanup migration first.' : (error?.message || 'The account could not be deleted.'), true);
    button.disabled = false;
  }
});
'''
    js = js.replace(signout, deletion + signout, 1)
settings_js_path.write_text(js, encoding='utf-8')
print('UPDATED: profile-settings.js deletion handler')

# Immediate client-side community language filter; SQL trigger remains authoritative.
community_path = Path('community.js')
js = community_path.read_text(encoding='utf-8')
if 'content-moderation.js' not in js:
    anchor = "} from './supabase-config.js';\n"
    if anchor not in js:
        raise RuntimeError('Community import anchor missing')
    js = js.replace(anchor, anchor + "import { hasBlockedLanguage } from './content-moderation.js?v=1';\n", 1)

post_check = "  if (hasBlockedLanguage([title, subtitle, text, city])) return say('That post contains language blocked by the community safety filter.', true);\n\n"
if post_check not in js:
    anchor = "  const submit = form.querySelector('button[type=\"submit\"]');\n"
    if anchor not in js:
        raise RuntimeError('Community post check anchor missing')
    js = js.replace(anchor, post_check + anchor, 1)

comment_check = "  if (hasBlockedLanguage(body)) return feedSay('That comment contains language blocked by the community safety filter.', true);\n"
if comment_check not in js:
    anchor = "  if (!body) return feedSay('Write a comment first.', true);\n"
    if anchor not in js:
        raise RuntimeError('Community comment check anchor missing')
    js = js.replace(anchor, anchor + comment_check, 1)
community_path.write_text(js, encoding='utf-8')
print('UPDATED: community.js moderation')
