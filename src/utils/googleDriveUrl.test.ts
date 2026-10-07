import { describe, expect, it } from 'vitest';
import { parseGoogleDriveFileUrl } from './googleDriveUrl';

describe('Google Drive file links', () => {
  it.each([
    'https://drive.google.com/file/d/file-id_123/view?usp=drive_link',
    'https://drive.google.com/file/d/file-id_123',
    'https://drive.google.com/open?id=file-id_123',
    'https://drive.google.com/uc?export=download&id=file-id_123',
  ])('resolves %s to a credential-free sharing URL', value => {
    expect(parseGoogleDriveFileUrl(value)).toEqual({ fileId: 'file-id_123', resourceKey: undefined,
      sourceUrl: 'https://drive.google.com/file/d/file-id_123/view' });
  });
  it('preserves resource keys while discarding unrelated and credential parameters', () => {
    expect(parseGoogleDriveFileUrl('https://drive.google.com/file/d/file123/view?resourcekey=0-key&access_token=secret#fragment'))
      .toEqual({ fileId: 'file123', resourceKey: '0-key', sourceUrl: 'https://drive.google.com/file/d/file123/view?resourcekey=0-key' });
  });
  it.each(['https://drive.google.com/drive/folders/folder123', 'https://drive.google.com/open?id=a&id=b',
    'https://drive.google.com/file/d/a/view?id=b', 'https://drive.google.com/open?id=..%2Fbad',
    'https://drive.google.com/open?id=a&resourcekey=x&resourcekey=y', 'http://drive.google.com/open?id=a',
    'https://user:password@drive.google.com/open?id=a'])('rejects invalid or ambiguous Drive links: %s', value => {
    expect(() => parseGoogleDriveFileUrl(value)).toThrow();
  });
  it.each(['https://drive.google.com.evil.example/file/d/file123/view',
    'https://evil.example/?next=https://drive.google.com/file/d/file123/view',
    'https://huggingface.co/datasets/owner/scene', 'invalid'])('leaves other URLs to existing loaders: %s', value => {
    expect(parseGoogleDriveFileUrl(value)).toBeNull();
  });
});

describe('Google Drive multi-account links', () => {
  it.each([
    'https://drive.google.com/file/u/0/d/file-id_123/view',
    'https://drive.google.com/file/u/1/d/file-id_123/view?usp=sharing',
    'https://drive.google.com/u/0/uc?id=file-id_123&export=download',
    'https://drive.google.com/u/2/open?id=file-id_123',
    'https://drive.google.com/u/0/file/d/file-id_123/view',
  ])('resolves the account-scoped link %s to the canonical sharing URL', value => {
    expect(parseGoogleDriveFileUrl(value)).toEqual({ fileId: 'file-id_123', resourceKey: undefined,
      sourceUrl: 'https://drive.google.com/file/d/file-id_123/view' });
  });
  it('keeps resource keys on account-scoped links', () => {
    expect(parseGoogleDriveFileUrl('https://drive.google.com/file/u/0/d/file123/view?resourcekey=0-key&authuser=0'))
      .toEqual({ fileId: 'file123', resourceKey: '0-key', sourceUrl: 'https://drive.google.com/file/d/file123/view?resourcekey=0-key' });
  });
  it.each(['https://drive.google.com/drive/u/0/folders/folder123', 'https://drive.google.com/u/0/drive/folders/folder123'])(
    'still explains that %s is a folder', value => {
      expect(() => parseGoogleDriveFileUrl(value)).toThrow('rather than a folder link');
    });
  it.each(['https://drive.google.com/u/x/uc?id=a', 'https://drive.google.com/file/u/0/d/a/view?id=b', 'https://drive.google.com/drive/my-drive'])(
    'rejects %s without calling it a folder', value => {
      expect(() => parseGoogleDriveFileUrl(value)).toThrow('Paste a Google Drive file sharing link');
    });
});
