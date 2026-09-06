import { test, expect } from './fixtures/test-fixtures';

test('directional borders paint only requested edges on panels and buttons', async ({ page }) => {
  await page.goto('/?touch=false');
  const cases = [
    { classes: 'border-t', widths: ['1px', '0px', '0px', '0px'] },
    { classes: 'border-r', widths: ['0px', '1px', '0px', '0px'] },
    { classes: 'border-b', widths: ['0px', '0px', '1px', '0px'] },
    { classes: 'border-l', widths: ['0px', '0px', '0px', '1px'] },
    { classes: 'border-t-2', widths: ['2px', '0px', '0px', '0px'] },
    { classes: 'border-r-2', widths: ['0px', '2px', '0px', '0px'] },
    { classes: 'border-b-2', widths: ['0px', '0px', '2px', '0px'] },
    { classes: 'border-l-2', widths: ['0px', '0px', '0px', '2px'] },
    { classes: 'border-x', widths: ['0px', '1px', '0px', '1px'] },
    { classes: 'border-y border-r', widths: ['1px', '1px', '1px', '0px'] },
    { classes: 'border border-b-2', widths: ['1px', '1px', '2px', '1px'] },
  ];
  for (const tag of ['div', 'button']) {
    for (const entry of cases) {
      const widths = await page.evaluate(({ tag, classes }) => {
        const element = document.createElement(tag);
        element.className = classes;
        document.body.append(element);
        const style = getComputedStyle(element);
        const result = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
        element.remove();
        return result;
      }, { tag, classes: entry.classes });
      expect(widths, `${tag}.${entry.classes}`).toEqual(entry.widths);
    }
  }
  const footer = page.locator('footer').first();
  await expect(footer).toHaveCSS('border-top-width', '1px');
  await expect(footer).toHaveCSS('border-right-width', '0px');
  await expect(footer).toHaveCSS('border-bottom-width', '0px');
  await expect(footer).toHaveCSS('border-left-width', '0px');
});
