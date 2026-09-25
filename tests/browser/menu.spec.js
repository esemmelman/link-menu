import { test, expect } from '@playwright/test';
const leaf = { id: 'link', sourceId: 'source', title: 'Example', url: 'https://example.com/', children: [] };
const initial = [{ id: 'main', title: 'Main', url: '', children: [leaf] }, { id: 'school', title: 'School', url: '', children: [] }];
async function setup(page, options = {}) {
  let record = { nodes: structuredClone(initial), revision: 1 };
  await page.addInitScript(() => {
    localStorage.setItem('sb-fgomaujsdblpzxhnnqrg-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com' } }));
  });
  await page.route('https://fgomaujsdblpzxhnnqrg.supabase.co/**', async route => {
    const req = route.request();
    if (req.url().includes('/link_menu_layouts')) {
      if (req.method() === 'PATCH') {
        if (options.fail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        record = req.postDataJSON(); return route.fulfill({ json: { revision: record.revision } });
      }
      return route.fulfill({ json: record });
    }
    if (req.url().includes('/link_deck_links')) return route.fulfill({ json: [{ id: 'source', title: 'Example', url: 'https://example.com/', category: 'Main' }] });
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
