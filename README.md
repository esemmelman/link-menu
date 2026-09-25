Horizontal menu populated from the categories and links in Link Deck.

Live: https://esemmelman.github.io/link-menu/

Sign in with the same account used at https://esemmelman.github.io/Link/.
Categories start as top-level menus. Choose Edit menu to reorder items by dragging, move them into submenus, or add/edit/delete items. Menus support three levels total. The Edit dialog also provides a parent selector for keyboard and touch use. Changes save automatically to your account; Undo reverses recent edits. Failed saves remain in memory with a retry button. Revision checks prevent overwriting changes from another device.

Import new links adds previously unimported Link Deck entries without changing existing menu placements. Menu edits do not modify the source Link Deck. Deleting an imported item allows it to be imported again later.

To archive an item, choose Edit menu, then its Edit button, check Archive, and Apply. Archived items and their descendants are hidden from navigation but remain in the editor. Uncheck Archive to restore an item in its original position. Archiving a parent preserves each child's own archive setting. Archive settings save automatically and importing new links does not restore archived entries.

The public repository contains application code only. Link data stays in Supabase behind the original account authentication, with owner-only row-level security. No private links or account credentials are embedded in the build.

Development: `npm ci`, `npm run dev`. Tests: `npx playwright install chromium`, then `npm test`. Build: `npm run build`. Pushes to main publish automatically through GitHub Pages.
