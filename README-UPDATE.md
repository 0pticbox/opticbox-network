# 0PTICBOX Network — v11 likes and comments

This is a drop-in update for the existing `opticbox-network` repository.

## Added in v11

- One like per signed-in member on every community post.
- Live like counts for signed-in and signed-out visitors.
- Expandable comment sections underneath every post.
- Comments up to 600 characters.
- Members can delete their own comments.
- Post owners can remove comments from their own posts.
- Site admins can delete or moderate any comment through Supabase.
- Signed-out visitors can read comments, then sign in to participate.
- Mobile-friendly like and comment controls.
- Existing post deletion automatically removes that post’s likes and comments.

The package also keeps the v10 messaging reliability fixes.

## Install

1. Copy every file and folder in this package into the root of the GitHub repository.
2. Replace matching files when asked.
3. Keep the repository’s existing `supabase-config.js`; it is intentionally not included.
4. Open **Supabase → SQL Editor**.
5. Run `supabase/2026-08-community-likes-comments.sql`.
6. Commit and push the repository changes.
7. Wait for GitHub Pages to deploy, then refresh `community.html`.

## Important

The new SQL file must be run before the Like and Comment buttons can work. It is safe to run the SQL again if you are unsure whether it completed.

## Main v11 files

- `community.html`
- `community.js`
- `network-upgrade.css`
- `supabase/2026-08-community-likes-comments.sql`
