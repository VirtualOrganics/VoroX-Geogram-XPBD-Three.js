import { buildFoam } from './vorox2/foam.js';
import { gradient, integratePoints } from './vorox2/dynamics.js';

export async function createVoroX({ Module, points, periodic=true, centering='circumcenter' }) {
  if (!Module || typeof Module.compute_delaunay !== 'function') {
    throw new Error('PeriodicDelaunayModule missing compute_delaunay');
  }
  let pointsArray = Array.isArray(points[0]) ? points : points.map(p=>[p[0],p[1],p[2]]);
  let stepCounter = 0;
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
  let flow = Array.from({length: tetrahedra.length}, ()=>Array(4).fill(0.0)); // Flow accumulator

  function step(dt, { edgeScale=true, scale=0.5, energy=5e-4, equilibration=true, contractive=false, expansive=true, recomputeEvery=5 }={}) {
    // Two clocks: fast dynamics each call; topology rebuild every `recomputeEvery` calls
    const g = gradient(foam, edgeScale, scale, energy, equilibration, contractive, expansive);
    pointsArray = integratePoints(pointsArray, g, dt, periodic);
    stepCounter = (stepCounter + 1) | 0;
    if (recomputeEvery < 1) recomputeEvery = 1;
    if (stepCounter % recomputeEvery === 0) {
      tetrahedra = triangulate();
    }
    // Always refresh centers/flow on current points (using latest or cached tets)
    foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering });
    return g; // Return the calculated gradient
  }

  return {
    step,
    getFoam: () => foam,
    getFlow: () => flow,
    setFlow: (f) => { flow = f; },
    getPoints: () => pointsArray,
    setPeriodic: (p)=>{ periodic = !!p; tetrahedra = triangulate(); foam = buildFoam({ pointsArray, tetrahedra, isPeriodic: periodic, centering }); },
  };
}


