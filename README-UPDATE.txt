0PTICBOX NETWORK UPDATE — August 2026

WHAT CHANGED
- New standalone signin.html page with cleaner post-login redirect.
- Member Area no longer contains login/register forms.
- Messages now use accepted friends instead of opening chats from member search.
- Friend requests can be sent, accepted, and declined from Messages.
- Blocked users and blocked conversations are hidden.
- Blocked users can be unblocked in Profile Settings.
- Video attachments are supported in private messages (MP4, WEBM, MOV up to 50 MB).
- Cursor selector moved into Profile Settings > General.
- The old cursor Easter egg is hidden site-wide.
- start_direct_thread is recreated and the PostgREST schema cache is reloaded.

INSTALL
1. Copy every file in this ZIP into the root of your GitHub repository, replacing files with the same name.
2. Keep your existing supabase-config.js file. It is not included in this ZIP.
3. In Supabase, open SQL Editor.
4. Run supabase/upgrade-messaging-friends-videos.sql in full.
5. Commit/push the files to the main branch.
6. Wait for GitHub Pages to finish deploying, then refresh the site.

IMPORTANT
The SQL upgrade is required. Uploading only the HTML/JS files will leave messaging broken.
