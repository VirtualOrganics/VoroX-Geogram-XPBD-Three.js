/**
 * Dual topology caches keyed by foamHash.
 * - edgeKeyToFace: Map edgeKey -> [i,j,k]
 * - obtuseAdj: CSR adjacency for directional obtuse gating
 * - mcCSR: CSR with weights for MC walking
 */

import { buildVoronoiEdgeGraph, buildHalfEdgeAdjacency } from './edgeGraph.js';

const caches = new Map(); // foamHash -> { edgeKeyToFace, obtuseAdj, mcCSR }

function toCSR(adj) {
  // adj is Array< Array<{to:number, p:number}> >
  const n = adj.length;
  const rowPtr = new Uint32Array(n + 1);
  let nnz = 0;
  for (let i = 0; i < n; i++) { nnz += (adj[i]?.length || 0); rowPtr[i+1] = nnz; }
  const colIdx = new Uint32Array(nnz);
  const w = new Float32Array(nnz);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const outs = adj[i] || [];
    for (let j = 0; j < outs.length; j++) {
      colIdx[k] = outs[j].to >>> 0;
      w[k] = Number.isFinite(outs[j].p) ? outs[j].p : 0;
      k++;
    }
  }
  return { rowPtr, colIdx, w };
}

export function primeCaches(foam) {
  const { voronoiEdgeToDelaunayFace } = foam;
  const edgeKeyToFace = voronoiEdgeToDelaunayFace || new Map();
  // Build obtuse adjacency once
  const { halfEdges, adj } = buildHalfEdgeAdjacency(foam);
  const csr = toCSR(adj);
  // For MC we reuse the same CSR (probabilities already normalized in adj)
  const mcCSR = csr;
  const obtuseAdj = csr;
  return { edgeKeyToFace, obtuseAdj, mcCSR };
}

export function setCache(foamHash, data) {
  caches.set(foamHash, data);
}

export function getDualMaps(foamHash) {
  const c = caches.get(foamHash);
  return c ? { edgeKeyToFace: c.edgeKeyToFace } : null;
}

export function getAdjacency(foamHash) {
  const c = caches.get(foamHash);
  return c ? { obtuseAdj: c.obtuseAdj, mcCSR: c.mcCSR } : null;
}

export function ensureCaches(foam, foamHash) {
  if (caches.has(foamHash)) return caches.get(foamHash);
  const built = primeCaches(foam);
  caches.set(foamHash, built);
  return built;
}

export function clearCache(foamHash) {
  caches.delete(foamHash);
}


