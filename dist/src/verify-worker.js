import { verifyLevel } from './verifier.js';
import { generateVerifiedGarage } from './verified-garage.js';

self.onmessage = ({ data }) => {
  const { requestId, level, type } = data;
  try {
    if (type === 'generate-garage') {
      const result = generateVerifiedGarage(level, {
        ...data.options,
        onProgress: ({ attempt, maxCandidates }) => {
          self.postMessage({ requestId, progress: `正在验证车辆 ${attempt}/${maxCandidates} 组…` });
        }
      });
      self.postMessage({ requestId, result });
      return;
    }
    const result = verifyLevel(level, {
      onProgress: ({ attempt, maxAttempts }) => {
        self.postMessage({ requestId, progress: `已回放 ${attempt}/${maxAttempts} 条路线…` });
      }
    });
    self.postMessage({ requestId, result });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
