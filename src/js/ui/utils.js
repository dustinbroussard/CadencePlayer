/**
 * UI Utilities and wrappers for browser-specific functions
 */

export const safeAlert = (msg) => {
  try {
    alert(msg);
  } catch (_) {
    console.log('[Alert Fallback]:', msg);
  }
};

export const safeConfirm = (msg) => {
  try {
    return confirm(msg);
  } catch (_) {
    // In headless environments, default to OK
    return true;
  }
};

export const safePrompt = (msg, def = '') => {
  try {
    return prompt(msg, def);
  } catch (_) {
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
      setTimeout(() => inThrottle = false, limit);
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
