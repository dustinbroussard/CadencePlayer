const { Buffer } = require('buffer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SimpleLRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const coverCache = new SimpleLRUCache(100);

const COVER_CONFIG_NAME = 'cover_config.json';
const COVER_DIR_NAME = 'covers';
const MAX_COVER_SIZE = 1024;
const DIRECTORY_CANDIDATES = [
  'cover',
  'folder',
  'front',
  'album',
  'albumart',
  'album.art',
  'artwork'
];
const DIRECTORY_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const SUPPORTED_OVERRIDE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SUPPORTED_PICTURE_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp']);

function toAppDataUrl(filePath) {
  return `app-data://${encodeURIComponent(filePath)}`;
}

function getConfigPath(userDataPath) {
  return path.join(userDataPath, COVER_CONFIG_NAME);
}

function getCoversDir(userDataPath) {
  return path.join(userDataPath, COVER_DIR_NAME);
}

function loadCoverConfig(userDataPath) {
  const configPath = getConfigPath(userDataPath);
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCoverConfig(userDataPath, config) {
  fs.writeFileSync(getConfigPath(userDataPath), JSON.stringify(config, null, 2));
}

function getEmbeddedPicture(common) {
  const pictures = Array.isArray(common?.picture) ? common.picture : [];
  for (const picture of pictures) {
    const format = normalizeMimeType(picture?.format || picture?.type);
    if (picture?.data && format) {
      return {
        data: picture.data.toString('base64'),
        format
      };
    }
  }
  const fallback = pictures[0];
  if (!fallback?.data) return null;
  return {
    data: fallback.data.toString('base64'),
    format: normalizeMimeType(fallback?.format || fallback?.type) || 'image/jpeg'
  };
}

function normalizeMimeType(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'jpg') return 'image/jpeg';
  if (normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  return SUPPORTED_PICTURE_FORMATS.has(normalized) ? normalized : normalized;
}

function findDirectoryCover(filePath) {
  const dir = path.dirname(filePath);
  for (const baseName of DIRECTORY_CANDIDATES) {
    for (const ext of DIRECTORY_EXTENSIONS) {
      const candidate = path.join(dir, `${baseName}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function createPlaceholderSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="No cover art">',
    '<defs>',
    '<linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">',
    '<stop offset="0%" stop-color="#1a2333"/>',
    '<stop offset="55%" stop-color="#223b5a"/>',
    '<stop offset="100%" stop-color="#0d1117"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="1024" height="1024" rx="120" fill="url(#bg)"/>',
    '<circle cx="512" cy="512" r="264" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" stroke-width="20"/>',
    '<circle cx="512" cy="512" r="74" fill="rgba(255,255,255,0.9)"/>',
    '<path d="M680 304v272.5c-20.2-15.1-46.7-24.5-76-24.5-66.3 0-120 47-120 105s53.7 105 120 105 120-47 120-105V404l126-31V304Z" fill="rgba(255,255,255,0.86)"/>',
    '<text x="512" y="832" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-size="66" font-family="Arial, sans-serif">Upload Artwork</text>',
    '</svg>'
  ].join('');
}

function createPlaceholderDataUrl() {
  return `data:image/svg+xml;base64,${Buffer.from(createPlaceholderSvg()).toString('base64')}`;
}

function buildCoverArtPayload(filePath, common, userDataPath) {
  const cacheKey = `${filePath}::${userDataPath}`;
  const cached = coverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const config = loadCoverConfig(userDataPath);
  const overridePath = config[filePath];
  let payload;
  if (overridePath && fs.existsSync(overridePath)) {
    payload = {
      url: toAppDataUrl(overridePath),
      source: 'override',
      placeholder: false,
      path: overridePath
    };
  } else {
    const picture = getEmbeddedPicture(common);
    if (picture?.data) {
      payload = {
        url: `data:${picture.format};base64,${picture.data}`,
        source: 'embedded',
        placeholder: false,
        format: picture.format
      };
    } else {
      const fallbackPath = findDirectoryCover(filePath);
      if (fallbackPath) {
        payload = {
          url: toAppDataUrl(fallbackPath),
          source: 'directory',
          placeholder: false,
          path: fallbackPath
        };
      } else {
        payload = {
          url: createPlaceholderDataUrl(),
          source: 'placeholder',
          placeholder: true
        };
      }
    }
  }

  coverCache.set(cacheKey, payload);
  return payload;
}

function validateOverrideImagePath(imagePath) {
  const ext = path.extname(imagePath || '').toLowerCase();
  return SUPPORTED_OVERRIDE_EXTENSIONS.has(ext);
}

function persistCoverOverride({ userDataPath, trackPath, imagePath, nativeImage }) {
  if (!fs.existsSync(imagePath)) {
    return { success: false, error: 'Image file does not exist.' };
  }
  if (!validateOverrideImagePath(imagePath)) {
    return { success: false, error: 'Unsupported image format. Use JPG, PNG, or WEBP.' };
  }

  const img = nativeImage.createFromPath(imagePath);
  if (img.isEmpty()) {
    return { success: false, error: 'Failed to load image.' };
  }

  let resized = img;
  const size = img.getSize();
  if (size.width > MAX_COVER_SIZE || size.height > MAX_COVER_SIZE) {
    const maxEdge = Math.max(size.width, size.height);
    const scale = MAX_COVER_SIZE / maxEdge;
    resized = img.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale))
    });
  }

  const coversDir = getCoversDir(userDataPath);
  fs.mkdirSync(coversDir, { recursive: true });

  const hash = crypto.createHash('sha1').update(trackPath).digest('hex');
  const outPath = path.join(coversDir, `${hash}.png`);
  fs.writeFileSync(outPath, resized.toPNG());

  const config = loadCoverConfig(userDataPath);
  config[trackPath] = outPath;
  saveCoverConfig(userDataPath, config);

  const cacheKey = `${trackPath}::${userDataPath}`;
  coverCache.delete(cacheKey);

  return {
    success: true,
    coverArt: {
      url: toAppDataUrl(outPath),
      source: 'override',
      placeholder: false,
      path: outPath
    }
  };
}

function clearCoverOverride({ userDataPath, trackPath }) {
  const config = loadCoverConfig(userDataPath);
  if (!config[trackPath]) {
    return { success: true };
  }
  delete config[trackPath];
  saveCoverConfig(userDataPath, config);

  const cacheKey = `${trackPath}::${userDataPath}`;
  coverCache.delete(cacheKey);

  return { success: true };
}

module.exports = {
  MAX_COVER_SIZE,
  buildCoverArtPayload,
  clearCoverOverride,
  createPlaceholderDataUrl,
  createPlaceholderSvg,
  findDirectoryCover,
  getEmbeddedPicture,
  loadCoverConfig,
  persistCoverOverride,
  saveCoverConfig,
  validateOverrideImagePath,
  coverCache
};
