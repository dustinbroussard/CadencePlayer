import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildCoverArtPayload,
  persistCoverOverride,
  validateOverrideImagePath
} = require('../src/js/cover-art-service.cjs');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-cover-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('cover-art-service', () => {
  it('prefers local directory art when embedded art is absent', () => {
    const root = makeTempDir();
    const albumDir = path.join(root, 'album');
    fs.mkdirSync(albumDir, { recursive: true });
    const trackPath = path.join(albumDir, 'song.mp3');
    const coverPath = path.join(albumDir, 'cover.png');
    fs.writeFileSync(trackPath, '');
    fs.writeFileSync(coverPath, 'png');

    const payload = buildCoverArtPayload(trackPath, {}, root);

    expect(payload.source).toBe('directory');
    expect(payload.url).toContain(encodeURIComponent(coverPath));
  });

  it('falls back to placeholder when no embedded or local art exists', () => {
    const root = makeTempDir();
    const trackPath = path.join(root, 'song.mp3');
    fs.writeFileSync(trackPath, '');

    const payload = buildCoverArtPayload(trackPath, {}, root);

    expect(payload.source).toBe('placeholder');
    expect(payload.url.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('validates supported override formats', () => {
    expect(validateOverrideImagePath('/tmp/cover.jpg')).toBe(true);
    expect(validateOverrideImagePath('/tmp/cover.png')).toBe(true);
    expect(validateOverrideImagePath('/tmp/cover.webp')).toBe(true);
    expect(validateOverrideImagePath('/tmp/cover.gif')).toBe(false);
  });

  it('persists scaled override metadata to config storage', () => {
    const root = makeTempDir();
    const trackPath = path.join(root, 'song.mp3');
    const imagePath = path.join(root, 'custom.png');
    fs.writeFileSync(trackPath, '');
    fs.writeFileSync(imagePath, 'png');

    const nativeImage = {
      createFromPath: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 1400, height: 700 }),
        resize: ({ width, height }) => ({
          toPNG: () => Buffer.from(`${width}x${height}`)
        }),
        toPNG: () => Buffer.from('original')
      })
    };

    const result = persistCoverOverride({
      userDataPath: root,
      trackPath,
      imagePath,
      nativeImage
    });

    expect(result.success).toBe(true);
    expect(result.coverArt.source).toBe('override');
    const configPath = path.join(root, 'cover_config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(fs.existsSync(config[trackPath])).toBe(true);
    expect(fs.readFileSync(config[trackPath], 'utf8')).toBe('1024x512');
  });
});
