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
      // XPBD per‑tet volume constraints driven by edge scores
      const triArea = (a, b, c) => {
        const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
        const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        const cx = ab[1]*ac[2] - ab[2]*ac[1];
        const cy = ab[2]*ac[0] - ab[0]*ac[2];
        const cz = ab[0]*ac[1] - ab[1]*ac[0];
        return 0.5 * Math.hypot(cx, cy, cz);
      };
      const wrap = (p)=> periodic ? [((p[0]%1)+1)%1, ((p[1]%1)+1)%1, ((p[2]%1)+1)%1] : p;
      const sub = (x,y)=>[x[0]-y[0], x[1]-y[1], x[2]-y[2]];
      const cross = (u,v)=>[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const len = (v)=>Math.hypot(v[0],v[1],v[2]);
      const norm = (v)=>{ const L=len(v)||1e-12; return [v[0]/L,v[1]/L,v[2]/L]; };
      const tetVolume = (a,b,c,d)=>{
        const ab=sub(b,a), ac=sub(c,a), ad=sub(d,a);
        const cx=cross(ab,ac);
        return Math.abs((cx[0]*ad[0]+cx[1]*ad[1]+cx[2]*ad[2]))/6;
      };
      const volGrads = (a,b,c,d)=>{
        // Gradients w.r.t vertices for signed volume (up to sign). Use consistent set.
        const gA = cross(sub(b,d), sub(c,d));
        const gB = cross(sub(c,d), sub(a,d));
        const gC = cross(sub(a,d), sub(b,d));
        const gD = cross(sub(b,a), sub(c,a));
        return [gA,gB,gC,gD].map(g=>[g[0]/6, g[1]/6, g[2]/6]);
      };

      // Build per‑tet percentage directive p_tet via accumulation from edges
      const graph = buildVoronoiEdgeGraph(foam);
      const accum = new Float64Array(foam.simplices.length);
      const wsum = new Float64Array(foam.simplices.length);
      graph.nodes.forEach(node=>{
        const key = node.key;
        const s = edgeScores.get(key);
        if (s === undefined) return;
        const t1 = node.tet1|0, t2 = node.tet2|0;
        const r = xpbdInvert ? (threshold - s) : (s - threshold);
        if ((r < 0 && !contractive) || (r > 0 && !expansive)) return;
        const absr = Math.abs(r);
        const f = (xpbdGamma === 1 || xpbdGamma === 1.0) ? absr : Math.pow(absr, xpbdGamma);
        const c = (r >= 0 ? +1 : -1) * (xpbdStrength || 0) * f;
        // weight by shared face area if available
        const face = graph.edgeToFace.get(key);
        let w = 1;
        if (face) {
          const [i,j,k]=face; const A=triArea(pointsArray[i],pointsArray[j],pointsArray[k]); if (A>0 && isFinite(A)) w=A;
        }
        accum[t1]+=w*c; wsum[t1]+=w; accum[t2]+=w*c; wsum[t2]+=w;
      });
      const maxStep = Math.abs(xpbdMaxScale || 0);
      const pTet = new Float64Array(accum.length);
      for (let t=0;t<pTet.length;t++){
        const w=wsum[t]||0; if (w<=1e-12||!isFinite(w)) { pTet[t]=0; continue; }
        const v=accum[t]/w; pTet[t]=Math.max(-maxStep, Math.min(maxStep, v));
      }

      const softness = 1 / (1 + 1e4 * Math.max(0, xpbdCompliance));
      const perIterClamp = Math.max(0, xpbdClamp);
      const iters = Math.max(1, (xpbdIters|0));
      let sumDelta = 0, samples = 0, globalMax = 0;
      for (let iter=0; iter<iters; iter++) {
        for (let ti=0; ti<foam.simplices.length; ti++){
          const p = pTet[ti]; if (Math.abs(p) <= 1e-8) continue;
          const tet = foam.simplices[ti]; if (!tet) continue;
          const ia=tet[0], ib=tet[1], ic=tet[2], id=tet[3];
          const A=pointsArray[ia], B=pointsArray[ib], C=pointsArray[ic], D=pointsArray[id];
          const Vcur = tetVolume(A,B,C,D);
          if (!(Vcur>1e-12) || !isFinite(Vcur)) continue;
          const Vtgt = Vcur * (1 + p);
          const err = Vtgt - Vcur; if (Math.abs(err) < 1e-10) continue;
          const grads = volGrads(A,B,C,D).map(norm);
          const sgn = err > 0 ? +1 : -1;
          const mag = softness * Math.min(perIterClamp, Math.abs(err)/(Vcur + 1e-12));
          const apply = (P, gvec)=> wrap([ P[0] + sgn * gvec[0]*mag, P[1] + sgn * gvec[1]*mag, P[2] + sgn * gvec[2]*mag ]);
          const before = [A.slice(),B.slice(),C.slice(),D.slice()];
          pointsArray[ia]=apply(A,grads[0]); pointsArray[ib]=apply(B,grads[1]); pointsArray[ic]=apply(C,grads[2]); pointsArray[id]=apply(D,grads[3]);
          const deltas=[len(sub(pointsArray[ia],before[0])), len(sub(pointsArray[ib],before[1])), len(sub(pointsArray[ic],before[2])), len(sub(pointsArray[id],before[3]))];
          const localMax = Math.max(...deltas);
          if (localMax>0){ lastStats.affectedFaces += 1; sumDelta += (deltas[0]+deltas[1]+deltas[2]+deltas[3])/4; samples += 1; if (localMax>globalMax) globalMax=localMax; }
        }
      }
      lastStats.meanDelta = samples ? (sumDelta / samples) : 0;
      lastStats.maxDelta = globalMax;
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


