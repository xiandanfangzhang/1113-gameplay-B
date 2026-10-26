import { generateRandomGarage } from './generator.js';
import { verifyLevel } from './verifier.js';

/** Only return a replacement garage after the normal engine has replayed a no-tool win. */
export function generateVerifiedGarage(level, {
  columns, rows, seed, maxCandidates = 40, maxAttempts, maxTicks, onProgress
} = {}) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error('候选车辆组数必须是正整数。');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('随机种子必须是 0–4294967295 的整数。');
  }
  const dimensions = { balls: level.balls, columns, rows, width: level.width, height: level.height };
  for (let attempt = 0; attempt < maxCandidates; attempt++) {
    const candidateSeed = (seed + attempt) >>> 0;
    const garage = generateRandomGarage({ ...dimensions, seed: candidateSeed });
    const verification = verifyLevel({ ...level, garage }, { maxAttempts, maxTicks });
    onProgress?.({ attempt: attempt + 1, maxCandidates });
    if (verification.status === 'solvable') return {
      status: 'solvable', garage, verification, seed: candidateSeed, attempts: attempt + 1
    };
    if (verification.status === 'invalid' || verification.status === 'impossible') return {
      status: verification.status, reason: verification.reason, attempts: attempt + 1
    };
  }
  return {
    status: 'unknown', attempts: maxCandidates,
    reason: `已验证 ${maxCandidates} 组车辆，尚未找到无道具通关路线；原车库保持不变。可调整列数、行数或球区后重试。`
  };
}
