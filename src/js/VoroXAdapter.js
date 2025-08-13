import { buildFoam, buildFoamHash } from './vorox2/foam.js';
import { ensureCaches, clearCache } from './vorox2/dual.js';
import { gradient, integratePoints, createVerletSystem } from './vorox2/dynamics.js';
import { buildVoronoiEdgeGraph } from './vorox2/edgeGraph.js';

export async function createVoroX({ Module, points, periodic=true, centering='circumcenter' }) {
  if (!Module || typeof Module.compute_delaunay !== 'function') {
    throw new Error('PeriodicDelaunayModule missing compute_delaunay');
  }
  let pointsArray = Array.isArray(points[0]) ? points : points.map(p=>[p[0],p[1],p[2]]);
  let stepCounter = 0;
  let verlet = null;
  function triangulate() {
    const flat = new Float64Array(pointsArray.flat());
    const raw = Module.compute_delaunay(flat, pointsArray.length, periodic);
    if (!raw) return [];
    
    // In periodic mode, all vertices should be valid
    // In non-periodic mode, we also keep all valid tetrahedra
    // We only filter out completely invalid tetrahedra
    const filtered = [];
    let invalidCount = 0;
    for (const t of raw) {
      const v0 = t[0]|0, v1 = t[1]|0, v2 = t[2]|0, v3 = t[3]|0;
      // Only filter if ALL vertices are valid (no infinite vertices)
      // This preserves the proper Delaunay triangulation
      if (v0 >= 0 && v0 < pointsArray.length &&
          v1 >= 0 && v1 < pointsArray.length &&
          v2 >= 0 && v2 < pointsArray.length &&
          v3 >= 0 && v3 < pointsArray.length) {
        filtered.push([v0, v1, v2, v3]);
      } else {
        invalidCount++;
      }
    }
    if (invalidCount > 0) {
      console.log(`Filtered out ${invalidCount} tetrahedra with infinite vertices (periodic=${periodic})`);
    }
    console.log(`Triangulation: ${raw.length} raw tets -> ${filtered.length} valid tets`);
    return filtered;
  }
  let tetrahedra = triangulate();
  let foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering });
  let foamHash = buildFoamHash(foam);
  let flow = Array.from({length: tetrahedra.length}, ()=>Array(4).fill(0.0)); // Flow accumulator
  let lastStats = { affectedFaces: 0, meanDelta: 0, maxDelta: 0 };
  // Topology change / priming handshake state
  let topologyDirty = false;          // set when triangulate() replaces tets/foam
  let needsPrimeOnBrain = false;      // prime dual caches on next Brain slot

  function step(dt, options = {}, scores) {
    const {
      useEdgeMode = false,
      useXPBD = false,
      edgeScores = null,
      edgeScale = false,
      edge_scale: edge_scale_opt,
      scale = 0.5,
      energy = 5e-4,
      equilibration = true,
      contractive = false,
      expansive = true,
      recomputeEvery = 5,
      threshold = 0.5,
      useVerlet = false,
      damping = 0.99,
      // XPBD params
      xpbdIters = 8,
      xpbdGain = 0.1,
      xpbdCompliance = 1e-4,
      xpbdClamp = 0.005,
      xpbdInvert = false,
      xpbdMaxScale = 0.10,
      xpbdStrength = 0.05, // g: percentage strength per step
      xpbdGamma = 1.0,     // shaping exponent γ
    } = options || {};

    const gradOptions = {
      useEdgeMode,
      edgeScores,
      edge_scale: (edge_scale_opt !== undefined ? edge_scale_opt : edgeScale),
      scale,
      energy,
      equilibration,
      contractive,
      expansive,
      threshold,
    };

    // reset per-step stats
    lastStats = { affectedFaces: 0, meanDelta: 0, maxDelta: 0 };
    let g = null;
    if (useXPBD && useEdgeMode && edgeScores && edgeScores.size > 0) {
      // XPBD face-area constraints driven by edge scores
      let edgeToFace = foam.__edgeFaceMapCache;
      if (!edgeToFace || edgeToFace.size === 0) {
        const graph = buildVoronoiEdgeGraph(foam);
        edgeToFace = graph.edgeToFace;
        foam.__edgeFaceMapCache = edgeToFace;
      }

      const triArea = (a, b, c) => {
        const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
        const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        const cx = ab[1]*ac[2] - ab[2]*ac[1];
        const cy = ab[2]*ac[0] - ab[0]*ac[2];
        const cz = ab[0]*ac[1] - ab[1]*ac[0];
        return 0.5 * Math.hypot(cx, cy, cz);
      };
      const centroid = (a, b, c) => [(a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3];
      const norm = (v)=>{ const n=Math.hypot(v[0],v[1],v[2])||1e-12; return [v[0]/n, v[1]/n, v[2]/n]; };
      const wrap = (p)=> periodic ? [((p[0]%1)+1)%1, ((p[1]%1)+1)%1, ((p[2]%1)+1)%1] : p;

      // Build faces list once with per-face percentage directive p
      const faces = [];
      edgeScores.forEach((s, key) => {
        const face = edgeToFace.get(key);
        if (!face) return;
        const [i,j,k] = face;
        const a = pointsArray[i], b = pointsArray[j], c = pointsArray[k];
        const A0 = triArea(a,b,c); // used only to early-out degenerate faces
        if (!(A0 > 0)) return;
        // Signed distance from threshold (respect invert)
        const r = xpbdInvert ? (threshold - s) : (s - threshold);
        if ((r < 0 && !contractive) || (r > 0 && !expansive)) return;
        const absr = Math.abs(r);
        const f = (xpbdGamma === 1 || xpbdGamma === 1.0) ? absr : Math.pow(absr, xpbdGamma);
        const p_raw = (r >= 0 ? +1 : -1) * (xpbdStrength || 0) * f;
        const maxStep = Math.abs(xpbdMaxScale || 0);
        const p = Math.max(-maxStep, Math.min(maxStep, p_raw)); // percentage delta per step
        faces.push({ idx: [i,j,k], p });
      });

      const softness = 1 / (1 + 1e4 * Math.max(0, xpbdCompliance));
      const perIterClamp = Math.max(0, xpbdClamp);
      const iters = Math.max(1, (xpbdIters|0));
      let sumDelta = 0;
      let samples = 0;
      let globalMax = 0;

      for (let iter=0; iter<iters; iter++) {
        for (const f of faces) {
          const [i,j,k] = f.idx;
          const a = pointsArray[i], b = pointsArray[j], c = pointsArray[k];
          const Acur = triArea(a,b,c) || 1e-12;
          // percentage-based target area for this iteration
          const Atgt = Acur * (1 + f.p);
          const err = Atgt - Acur; // >0 means expand, <0 contract
          if (Math.abs(err) < 1e-8) continue;
          const ctr = centroid(a,b,c);
          const dirOut = [
            norm([a[0]-ctr[0], a[1]-ctr[1], a[2]-ctr[2]]),
            norm([b[0]-ctr[0], b[1]-ctr[1], b[2]-ctr[2]]),
            norm([c[0]-ctr[0], c[1]-ctr[1], c[2]-ctr[2]])
          ];
          const sgn = err > 0 ? +1 : -1; // +1 expand, -1 contract
          // Normalize by current area to keep scale-free behavior
          const mag = softness * Math.min(perIterClamp, Math.abs(err) / (Acur + 1e-12));
          // Per-face deltas (same magnitude per vertex)
          const dA = mag, dB = mag, dC = mag;
          const localMax = Math.max(dA, dB, dC);
          if (localMax > 0) {
            lastStats.affectedFaces += 1;
            sumDelta += (dA + dB + dC) / 3;
            samples += 1;
            if (localMax > globalMax) globalMax = localMax;
          }
          // Apply equally to vertices
          const apply = (p, d) => wrap([ p[0] + sgn * d[0] * mag, p[1] + sgn * d[1] * mag, p[2] + sgn * d[2] * mag ]);
          pointsArray[i] = apply(a, dirOut[0]);
          pointsArray[j] = apply(b, dirOut[1]);
          pointsArray[k] = apply(c, dirOut[2]);
        }
      }
      lastStats.meanDelta = samples ? (sumDelta / samples) : 0;
      lastStats.maxDelta = globalMax;
      // Diagnostics vector: zeros (not used by XPBD)
      g = Array.from({length: pointsArray.length}, ()=>[0,0,0]);
    } else {
      // Gradient-based integration (Verlet/Euler only here; XPBD path above bypasses integrators)
      g = gradient(foam, gradOptions);
      if (useVerlet) {
        if (!verlet || verlet.numPoints !== pointsArray.length || verlet.isPeriodic !== !!periodic) {
          verlet = createVerletSystem(pointsArray.length, !!periodic);
          verlet.initialize(pointsArray);
        } else {
          verlet.setPositions(pointsArray);
        }
        verlet.setForces(g);
        verlet.setDamping(damping);
        pointsArray = verlet.integrate(dt);
      } else {
        pointsArray = integratePoints(pointsArray, g, dt, periodic);
      }
    }
    stepCounter = (stepCounter + 1) | 0;
    const recEvery = Math.max(1, (recomputeEvery|0));
    if (stepCounter % recEvery === 0) {
      // Retriangulate and mark topology dirty so the main loop can gate XPBD
      const oldHash = foamHash;
      tetrahedra = triangulate();
      foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering });
      foamHash = buildFoamHash(foam);
      // Clear caches for old topology, request priming on next Brain
      clearCache(oldHash);
      topologyDirty = true;
      needsPrimeOnBrain = true;
    } else {
      // Refresh foam with latest points but same tets
      const prevHash = foamHash;
      foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering });
      foamHash = buildFoamHash(foam);
      if (foamHash !== prevHash) {
        clearCache(prevHash);
      }
    }
    return g; // Return the calculated gradient
  }

  return {
    step,
    getFoam: () => foam,
    getFoamHash: () => foamHash,
    primeDualCaches: () => ensureCaches(foam, foamHash),
    // Topology handshake helpers
    consumeTopologyDirty: () => { if (topologyDirty) { topologyDirty = false; return true; } return false; },
    shouldPrimeOnBrain: () => !!needsPrimeOnBrain,
    clearPrimeOnBrain: () => { needsPrimeOnBrain = false; },
    getFlow: () => flow,
    setFlow: (f) => { flow = f; },
    getPoints: () => pointsArray,
    setPeriodic: (p)=>{ periodic = !!p; tetrahedra = triangulate(); foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering }); foamHash = buildFoamHash(foam); },
  };
}


