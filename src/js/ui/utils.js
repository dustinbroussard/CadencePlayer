/**
 * UI Utilities and wrappers for browser-specific functions
 */

const isJsdom = () => /\bjsdom\b/i.test(globalThis.navigator?.userAgent || '');

export const safeAlert = (msg) => {
  try {
    if (isJsdom()) throw new Error('Dialog not supported in jsdom');
    alert(msg);
  } catch {
    if (!isJsdom()) console.log('[Alert Fallback]:', msg);
  }
};

export const safeConfirm = (msg) => {
  try {
    if (isJsdom()) throw new Error('Dialog not supported in jsdom');
    return confirm(msg);
  } catch {
    // In headless environments, default to OK
    return true;
  }
};

export const safePrompt = (msg, def = '') => {
  try {
    if (isJsdom()) throw new Error('Dialog not supported in jsdom');
    return prompt(msg, def);
  } catch {
    return def;
  }
};

/**
 * Throttles a function call
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
};

/**
 * Debounces a function call
 */
export const debounce = (func, wait) => {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};
