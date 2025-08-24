self.addEventListener('message', e => {
  const { fftData, sampleRate, config } = e.data;

  // Placeholder for heavy FFT processing offloaded to the worker
  // In a full implementation, this would perform chord detection and
  // return the detected chord information. For now we simply echo back
  // the data to demonstrate the worker structure.
  const result = {
    fftSize: fftData.length,
    sampleRate,
    config
  };

  self.postMessage(result);
});
