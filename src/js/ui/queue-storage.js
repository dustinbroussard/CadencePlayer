/**
 * Persistent storage for saved queues
 */

export const getSavedQueues = () => {
  try {
    return JSON.parse(localStorage.getItem('savedQueues') || '{}') || {};
  } catch (e) {
    console.error('Failed to parse saved queues:', e);
    return {};
  }
};

export const setSavedQueues = (queues) => {
  try {
    localStorage.setItem('savedQueues', JSON.stringify(queues || {}));
  } catch (e) {
    console.error('Failed to save queues:', e);
  }
};
