0PTICBOX NETWORK — V14 OPINION HUB

WHAT THIS UPDATE DOES
- Makes the front page the main community opinion hub.
- Loads every visible activity post in batches instead of stopping at 60 or 100.
- Shows normal posts, listening posts, events, product reviews, and official updates together.
- Adds likes and comments directly to community posts on the front page.
- Uses separate profile lookups, so it avoids the Supabase "more than one relationship" embed error.
- Updates automatically when the page becomes active again.

INSTALL
1. Put these files in the ROOT of your GitHub repository:
   - index.html
   - social-home.js
   - opinion-hub.css
2. Replace the existing index.html and social-home.js.
3. Commit and push.
4. Wait for GitHub Pages to deploy.
5. Hard-refresh the front page.

IMPORTANT
- Keep your existing supabase-config.js.
- No new Supabase SQL query is required.
- The likes/comments migration from v11 must already be installed for those controls to work.
