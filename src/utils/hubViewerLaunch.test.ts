import { afterEach, expect, it } from 'vitest';
import { clearUrlLoadRequestFromLocation, hasUrlToLoad, useReconstructionStore } from '../store/reconstructionStore';
import { HUB_VIEWER_LAUNCH_ID, getViewerStartupUrl, readHubViewerUrl } from './hubViewerLaunch';

const target = 'https://colmapview.opsiclear.com/?url=https%3A%2F%2Fexample.com%2Fscene.json#c=saved';
function launch(viewerUrl = target, path = '/s/d/AAAAAAAAAAAAAAAA') {
  window.history.replaceState(null, '', path);
  const node = document.createElement('script');
  node.id = HUB_VIEWER_LAUNCH_ID;
  node.type = 'application/json';
  node.textContent = JSON.stringify({ version: 1, viewerUrl });
  document.head.append(node);
}
afterEach(() => {
  document.getElementById(HUB_VIEWER_LAUNCH_ID)?.remove();
  window.history.replaceState(null, '', '/');
});

it.each(['/s/d/AAAAAAAAAAAAAAAA', '/s/RoughhewnBiplane', '/hub/roughhewnbiplane'])('loads stored startup data at %s', path => {
  launch(target, path);
  expect(getViewerStartupUrl().href).toBe(target);
  expect(hasUrlToLoad()).toBe(true);
});

it('pins the dataset while honoring visitor display flags and a newer camera view', () => {
  launch(target, '/s/d/AAAAAAAAAAAAAAAA?url=https://attacker.example&embed=1&touch=0&splatBackend=webgl#c=new');
  const url = getViewerStartupUrl();
  expect(url.searchParams.get('url')).toBe('https://example.com/scene.json');
  expect(url.searchParams.get('embed')).toBe('1');
  expect(url.searchParams.get('touch')).toBe('0');
  expect(url.searchParams.get('splatBackend')).toBe('webgl');
  expect(url.hash).toBe('#c=new');
});

it.each(['https://attacker.example/?url=scene', 'https://colmapview.opsiclear.com/hub/?url=scene',
  'https://user:pass@colmapview.opsiclear.com/?url=scene', `${target.split('#')[0]}#d=another-source`])('rejects invalid viewer targets: %s', url => {
  launch(url);
  expect(readHubViewerUrl()).toBeNull();
});

it('does not interpret bootstrap data on ordinary viewer pages', () => {
  launch(target, '/?url=https://example.com/direct.json');
  expect(getViewerStartupUrl().searchParams.get('url')).toBe('https://example.com/direct.json');
});

it('clears the launch and returns to the landing address when a share load is cancelled', () => {
  launch(target, '/s/d/AAAAAAAAAAAAAAAA?drive=open&state=unrelated&embed=1');
  clearUrlLoadRequestFromLocation();
  expect(readHubViewerUrl()).toBeNull();
  expect(window.location.pathname).toBe('/');
  expect(window.location.search).toBe('?embed=1');
  expect(hasUrlToLoad()).toBe(false);
});

it('does not show a permanent loading state for a share without a dataset', () => {
  launch('https://colmapview.opsiclear.com/');
  expect(hasUrlToLoad()).toBe(false);
});

it('releases the short identity only when a replacement source commits', () => {
  useReconstructionStore.getState().clear();
  launch(target);
  useReconstructionStore.getState().setSourceInfo('manifest', 'https://example.com/scene.json');
  expect(readHubViewerUrl()).not.toBeNull();
  useReconstructionStore.getState().setSourceInfo('manifest', 'https://example.com/other.json');
  expect(readHubViewerUrl()).toBeNull();
  expect(window.location.pathname).toBe('/');
  useReconstructionStore.getState().clear();
});
