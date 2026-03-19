/**
 * Chord Visualization Colors mapping
 */

export const getChordColors = (name) => {
  const quality = name.replace(/^[A-G]#?/, '');
  
  if (quality.includes('dim')) return { fg: '#f87171', bg: 'rgba(248,113,113,0.15)' };
  if (quality.includes('aug')) return { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
  
  // Minor
  if (quality.startsWith('m') && !quality.startsWith('maj')) {
    return { fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)' };
  }
  
  // Suspended
  if (quality.includes('sus')) return { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)' };
  
  // 6ths, 7ths, 9ths etc. (more colorful)
  if (quality.includes('6')) return { fg: '#34d399', bg: 'rgba(52,211,153,0.15)' };
  if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13')) {
    return { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
  }
  
  // Power chords
  if (quality.includes('5')) return { fg: '#a1a1aa', bg: 'rgba(161,161,170,0.15)' };
  
  // Default (Major)
  return { fg: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
};
