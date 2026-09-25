import { test, expect } from '@playwright/test';
const leaf = { id: 'link', sourceId: 'source', title: 'Example', url: 'https://example.com/', children: [] };
const initial = [{ id: 'main', title: 'Main', url: '', children: [leaf] }, { id: 'school', title: 'School', url: '', children: [] }];
async function setup(page, options = {}) {
  let record = { nodes: structuredClone(initial), revision: 1 };
  const source = [{ id: 'source', title: 'Example', url: 'https://example.com/', category: 'Main' }];
  await page.addInitScript(() => {
    localStorage.setItem('sb-fgomaujsdblpzxhnnqrg-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } }));
  });
  await page.route('https://fgomaujsdblpzxhnnqrg.supabase.co/**', async route => {
    const req = route.request();
    if (req.url().includes('/link_menu_layouts')) {
      if (req.method() === 'PATCH') {
        if (options.fail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        record = req.postDataJSON();
        if (options.sync) {
          function sync(nodes, category) {
            for (const node of nodes) {
              if (node.url && !node.sourceId) { node.sourceId = node.id; source.push({ id: node.id, title: node.title, url: node.url, category: category || 'Uncategorized' }); }
              sync(node.children, category || node.title);
            }
          }
          sync(record.nodes);
        }
        return route.fulfill({ json: { revision: record.revision, nodes: record.nodes } });
      }
      return route.fulfill({ json: record });
    }
    if (req.url().includes('/link_deck_links')) return route.fulfill({ json: source });
    return route.fulfill({ json: {} });
  });
  await page.goto('/'); await expect(page.locator('#editToggle')).toBeVisible();
  return () => record;
}
test('opens links and creates a persisted third-level submenu', async ({ page }) => {
  const record = await setup(page);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Example', exact: true })).toHaveAttribute('href', 'https://example.com/');
  await page.locator('#editToggle').click();
  await page.locator('[data-id="main"]').getByText('+ Submenu', { exact: true }).click();
  await page.locator('#itemTitle').fill('Resources'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toBeHidden();
  const folder = record().nodes[0].children.find(x => x.title === 'Resources');
  await page.locator('[data-id="link"]').getByText('Edit', { exact: true }).click();
  await page.locator('#parent').selectOption(folder.id); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toBeHidden();
  expect(record().nodes[0].children[0].children[0].id).toBe('link');
  await page.reload(); await page.locator('#editToggle').click();
  await expect(page.locator('[data-id="link"]')).toHaveCSS('margin-left', '48px');
  await expect(page.locator('[data-id="link"]').getByText('+ Submenu')).toHaveCount(0);
});
test('drag moves items between categories and undo restores them', async ({ page }) => {
  const record = await setup(page); await page.locator('#editToggle').click();
  await page.locator('[data-id="link"]').dragTo(page.locator('[data-id="school"]'));
  await expect(page.locator('#status')).toBeHidden();
  expect(record().nodes[1].children[0].id).toBe('link');
  await page.locator('#undo').click(); await expect(page.locator('#status')).toBeHidden();
  expect(record().nodes[0].children[0].id).toBe('link');
});
test('failed saves retain edits and expose retry', async ({ page }) => {
  await setup(page, { fail: true }); await page.locator('#editToggle').click();
  await page.locator('[data-id="link"]').getByText('Edit', { exact: true }).click();
  await page.locator('#itemTitle').fill('Renamed'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Not saved');
  await expect(page.locator('#save')).toBeEnabled(); await expect(page.locator('[data-id="link"]')).toContainText('Renamed');
});
test('mobile has usable parent selector and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page); await page.locator('#editToggle').click();
  await page.locator('[data-id="link"]').getByText('Edit', { exact: true }).click();
  await page.locator('#parent').selectOption('school'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('signed out users see login without private menu items', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#login')).toBeVisible(); await expect(page.locator('#menu li')).toHaveCount(0);
});
async function archive(page, id, checked) {
  await page.locator(`[data-id="${id}"]`).getByText('Edit', { exact: true }).click();
  await page.getByLabel('Archive', { exact: true }).setChecked(checked);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toBeHidden();
}
test('archive persists across reload and import; unarchive restores the link', async ({ page }) => {
  const record = await setup(page); await page.locator('#editToggle').click();
  await archive(page, 'link', true);
  expect(record().nodes[0].children[0].archived).toBe(true);
  await expect(page.locator('#menu a')).toHaveCount(0);
  await expect(page.locator('[data-id="link"]')).toContainText('Archived');
  await page.reload(); await page.locator('#editToggle').click();
  await expect(page.locator('#menu a')).toHaveCount(0);
  await page.locator('#import').click(); await expect(page.locator('#status')).toHaveText('No new links.');
  await expect(page.locator('#menu a')).toHaveCount(0);
  await archive(page, 'link', false);
  await expect(page.locator('#menu a')).toHaveAttribute('href', 'https://example.com/');
  expect(record().nodes[0].children[0].archived).toBe(false);
});
test('archiving a parent hides descendants without changing their archive settings', async ({ page }) => {
  const record = await setup(page); await page.locator('#editToggle').click();
  await archive(page, 'main', true);
  await expect(page.locator('#menu').getByRole('button', { name: 'Main', exact: true })).toHaveCount(0);
  await expect(page.locator('#menu a')).toHaveCount(0);
  await expect(page.locator('[data-id="link"]')).toContainText('Archived parent');
  expect(record().nodes[0].children[0].archived).toBeUndefined();
  await archive(page, 'link', true);
  await archive(page, 'main', false);
  await expect(page.locator('#menu').getByRole('button', { name: 'Main', exact: true })).toBeVisible();
  await expect(page.locator('#menu a')).toHaveCount(0);
  await archive(page, 'link', false);
  await expect(page.locator('#menu a')).toHaveCount(1);
});
test('new links retain sync IDs on later saves and are not duplicated by import', async ({ page }) => {
  const record = await setup(page, { sync: true }); await page.locator('#editToggle').click();
  await page.locator('#add').click();
  await page.locator('#itemTitle').fill('New link');
  await page.locator('#itemUrl').fill('https://example.com/new');
  await page.locator('#parent').selectOption('main');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#status')).toBeHidden();
  const added = record().nodes[0].children.find(node => node.title === 'New link');
  expect(added.sourceId).toBe(added.id);
  await archive(page, added.id, true);
  expect(record().nodes[0].children.find(node => node.id === added.id).sourceId).toBe(added.id);
  await page.locator('#import').click();
  await expect(page.locator('#status')).toHaveText('No new links.');
  await expect(page.locator('#tree .row')).toHaveCount(4);
});
