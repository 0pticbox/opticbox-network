# 0PTICBOX Network v12 — Supabase relationship fix

This update fixes the PostgREST error:

`Could not embed because more than one relationship was found for activity_posts and profiles.`

## What changed

- Community posts no longer depend on an automatic embedded `activity_posts -> profiles` relationship.
- Comments no longer depend on an automatic embedded `activity_post_comments -> profiles` relationship.
- The page now loads profile rows separately and safely attaches them by `user_id`.
- `community.html` uses `community.js?v=12` so browsers do not keep the broken cached JavaScript.

## Install

1. Replace your repository files with the files in this package.
2. Keep your existing `supabase-config.js`.
3. Commit and push to GitHub.
4. Wait for GitHub Pages to deploy, then hard-refresh the Community page.

No new Supabase SQL query is required for this relationship fix. Keep the likes/comments and activity-post constraint migrations you already ran.
