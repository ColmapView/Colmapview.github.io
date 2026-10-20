import type { Page } from '@playwright/test';

export const publicationId = 'HappyTree-LAAAAAAAAAAAAAAAA';
const endpoint = 'https://hub.invalid/hub/api/publications';

/** Widget/UI fixture only; mandatory Siteverify and source checks run in the Worker integration suite. */
export async function mockHubPublication(page: Page, pending = false) {
  const posts: Record<string, unknown>[] = [];
  await page.route(`${endpoint}/config`, route => route.fulfill({ json: { enabled: true, siteKey: 'test-site-key' } }));
  await page.route(endpoint, route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: pending ? 202 : 201, json: pending ? { status: 'pending', id: publicationId }
      : { status: 'published', id: publicationId, shareUrl: `https://hub.invalid/s/${publicationId}`, catalogUrl: 'https://hub.invalid/hub/datasets/#shared-datasets' } });
  });
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.turnstile = {
      render(element, options) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Test bot check';
        button.style.width = options.size === 'compact' ? '150px' : '300px';
        button.style.height = options.size === 'compact' ? '140px' : '65px';
        button.onclick = () => options.callback('single-use-browser-fixture'); element.append(button); return 'test';
      }, remove() { document.querySelectorAll('button').forEach(button => { if (button.textContent === 'Test bot check') button.remove(); }); }
    };` }));
  return posts;
}
