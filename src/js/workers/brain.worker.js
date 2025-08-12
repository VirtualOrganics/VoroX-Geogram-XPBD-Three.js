// Brain worker: offloads PR/MC scoring and adjacency prep from main thread
// Note: first pass uses structured-clone friendly objects; can be upgraded to Transferables later

import { calculateEdgeScores, calculateEdgeScoresMonteCarlo } from '../vorox2/dynamics.js';

// Simple per-foamHash cache for reuse across requests
const cache = new Map(); // foamHash -> { lastMethod, lastParams, lastScores }

self.onmessage = (ev) => {
  const { foamHash, method, params, foamData } = ev.data || {};
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Rehydrate a lightweight foam object expected by dynamics
  const foam = {
    points: foamData.points,
    simplices: foamData.simplices,
    centers: foamData.centers,
    facetPairs: foamData.facetPairs,
    voronoiEdges: foamData.voronoiEdges,
    isPeriodic: !!foamData.isPeriodic,
    // Minimal fields used by dynamics helpers that rely on optional caches
  };

  // Compute scores
  let scoreMap;
  if (method === 'mc') {
    const { L = 12, K = 64, alpha = 0.9 } = params || {};
    const res = calculateEdgeScoresMonteCarlo(foam, L, K, alpha);
    scoreMap = res.scores;
  } else {
    const { depth = 15, damping = 0.85 } = params || {};
    const res = calculateEdgeScores(foam, depth, damping);
    scoreMap = res.scores;
  }

  // Convert Map<string, number> to serializable arrays
  const keys = [];
  const values = new Float32Array(scoreMap.size);
  let idx = 0;
  scoreMap.forEach((v, k) => { keys.push(k); values[idx++] = v; });

  const valuesArr = Array.from(values); // structured clone safe (first pass)

  const vals = valuesArr;
  const n = vals.length;
  const mean = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n : 0;
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  cache.set(foamHash, { lastMethod: method, lastParams: params, lastScores: scoreMap });

  self.postMessage({
    foamHash,
    method,
    params,
    runtimeMs: (t1 - t0),
    scores: { keys, values: valuesArr },
    stats: { count: n, mean, variance }
  });
};


