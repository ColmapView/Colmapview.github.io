import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

test.describe('ImageGallery', () => {
  test('renders grid and list image items after loading a dataset', async ({ page }) => {
    await page.goto('/');

    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }

    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const galleryImage = page.getByText('photo.jpg').first();
    await expect(galleryImage).toBeVisible({ timeout: 10000 });

    await galleryImage.hover();
    await expect(page.getByText('1 3D points')).toBeVisible({ timeout: 5000 });

    // The gallery toolbar only mounts while its slot is hovered (ImageGallery.tsx
    // showToolbar = !hideToolbar && (touchMode || galleryHeaderHovered)), so hover
    // the slot first and keep the pointer there for the click.
    await page.getByTestId('image-gallery-toolbar-slot').hover();
    await page.locator('button[data-tooltip="List view with stats"]').click();

    const listItems = page.locator('.list-stats-container');
    await expect(listItems).toHaveCount(2);

    await expect(listItems.filter({ hasText: 'photo.jpg' })).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo-2.jpg' })).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo.jpg' }).getByText('pts · covis · err')).toBeVisible();
    await expect(listItems.filter({ hasText: 'photo-2.jpg' }).getByText('pts · covis · err')).toBeVisible();
  });

  test('divider grab strip never hit-tests over the 3D canvas', async ({ page }) => {
    await page.goto('/');
    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }
    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const divider = page.locator('.resize-handle');
    const box = await divider.boundingBox();
    expect(box).not.toBeNull();

    // Probe a quarter of the way down, NOT mid-height: the collapse chevron is
    // 36px tall and centred on the divider, and it deliberately overhangs ~5px
    // onto the viewer (see .gallery-collapse-handle). That narrow tab is the
    // documented exception; the full-height grab strip is what must stay off
    // the canvas.
    const probeY = box!.y + box!.height * 0.25;

    // 2px into the viewer from the divider's left edge must belong to the
    // scene, not the divider — the grab strip may only overhang the gallery.
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return {
        // SVG elements carry an SVGAnimatedString here, so className alone
        // cannot prove the hit missed the divider — closest() can.
        className: typeof el?.className === 'string' ? el.className : '',
        inHandle: Boolean(el?.closest('.resize-handle')),
        inScene: Boolean(el?.closest('.scene-3d-container')),
      };
    }, [box!.x - 2, probeY] as [number, number]);

    expect(hit.className).not.toContain('resize-handle');
    expect(hit.inHandle).toBe(false);
    expect(hit.inScene).toBe(true);
  });

  test('collapse tab stays fully on-screen when the gallery is collapsed', async ({ page }) => {
    await page.goto('/');
    const closeButton = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await closeButton.isVisible({ timeout: 2000 })) {
      await closeButton.click();
    }
    await loadTestDataset(page);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45000 });

    const tab = page.locator('.gallery-collapse-handle');
    await tab.click(); // collapse — the gallery width animates for 300ms

    const viewport = page.viewportSize();

    // Poll the DIVIDER to the end of the collapse animation, not the tab's own
    // right edge: expect.poll resolves on its first passing sample, and the
    // very first sample lands at the start of the 300ms width transition, when
    // the divider is still mid-row and the tab is trivially on-screen. The
    // overhang only exists once the divider is flush against the layout row's
    // clipped right edge, so wait for exactly that, then measure once.
    await expect
      .poll(async () => {
        const box = await page.locator('.resize-handle').boundingBox();
        return box ? Math.round(box.x + box.width) : -1;
      }, { timeout: 2000 })
      .toBe(viewport!.width);

    const box = await tab.boundingBox();
    // boundingBox() reports the unclipped border box, so this is the real
    // overhang past the viewport, not what survives the ancestor clip.
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    // Guards a "fix" that shrank the tab to fit; the clip itself is caught above.
    expect(box!.width).toBeGreaterThanOrEqual(11);

    await tab.click(); // reopen
    await expect(page.getByText('photo.jpg').first()).toBeVisible({ timeout: 5000 });
  });
});
