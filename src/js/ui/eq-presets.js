/**
 * Equalizer Presets and logic
 */

export const BUILTIN_EQ_PRESETS = {
  'Flat': [0, 0, 0, 0, 0],
  'Bass Boost': [6, 4, 0, -2, -2],
  'Vocal Boost': [-2, -1, 4, 3, 1],
  'Treble Boost': [-2, -1, 0, 4, 6],
  'Electronic': [4, 2, 0, 2, 4],
  'Pop': [-1, 2, 4, 2, -1],
  'Rock': [3, 1, -2, 1, 3],
  'Classic': [5, 3, -1, 2, 4],
  'Jazz': [4, 2, 1, 2, 4],
  'Dance': [5, 3, 0, 1, 5]
};

export const getCustomEqPresets = () => {
  try {
    return JSON.parse(localStorage.getItem('eqPresets') || '{}') || {};
  } catch (e) {
    console.error('Failed to parse EQ presets:', e);
    return {};
  }
};

export const setCustomEqPresets = (presets) => {
  try {
    localStorage.setItem('eqPresets', JSON.stringify(presets || {}));
  } catch (e) {
    console.error('Failed to save EQ presets:', e);
  }
};
