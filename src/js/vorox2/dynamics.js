import { minImagePoint, wrap01, barycenter } from './core.js';

function vecSub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vecAdd(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vecScale(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function vecNorm(a){ return Math.hypot(a[0],a[1],a[2]); }

function homothety(Δ, catchment, scale, energy, equilibration, contractive, expansive) {
  const n = vecNorm(Δ) || 1e-12;
  let h = 0.0;
  if (equilibration) h += 1 - (scale / n);
  if (contractive)  h += 1 - (scale / n) * (1 - catchment);
  if (expansive)    h += 1 - (scale / n) * catchment;
  return vecScale(Δ, energy * h);
}

export function simplexCatchment(foam, simplexIndex) {
  let catchment = 0.0;
  for (let fid=0; fid<4; fid++) {
    const d = foam.knotDist[simplexIndex][fid];
    if (d === 0) {
      const k = foam.facetKnot[simplexIndex][fid];
      if (k > 0) {
        const len = foam.knots[k-1].length || 1;
        const nc = foam.numCatched[k-1] || 0;
        catchment += (len + nc) / len;
      }
    }
  }
  catchment /= 4; // number of facets in a tetrahedron
  return catchment;
}

export function gradient(foam, edge_scale, scale, energy, equilibration, contractive, expansive) {
    const grad = Array.from({ length: foam.points.length }, () => [0,0,0]);
    // Per VoroX.jl, the gradient for point motion is ALWAYS computed from centroids for stability,
    // even if the foam's flow structure was built with circumcenters.
    const motion_centers = foam.simplices.map(tet => barycenter(foam.points, tet, foam.isPeriodic));

    for (let simplex_idx=0; simplex_idx<foam.simplices.length; simplex_idx++) {
        const catchment = simplexCatchment(foam, simplex_idx);
        const p_indices = foam.simplices[simplex_idx];
        const points = p_indices.map(i => foam.points[i]);
        const c = motion_centers[simplex_idx];
        if (!c) continue;

        for (let i=0; i<p_indices.length; i++) {
            const p_idx = p_indices[i];
            const p = points[i];

            if (edge_scale) {
                for (let b=0; b<4; b++) if (b!==i) {
                    const q = foam.isPeriodic ? minImagePoint(p, points[b]) : points[b];
                    const Δ = vecSub(q, p);
                    const h = homothety(Δ, catchment, scale, energy, equilibration, contractive, expansive);
                    grad[p_idx][0] += h[0];
                    grad[p_idx][1] += h[1];
                    grad[p_idx][2] += h[2];
                }
            } else {
                const Δ = [c[0]-p[0], c[1]-p[1], c[2]-p[2]];
                const h = homothety(Δ, catchment, scale, energy, equilibration, contractive, expansive);
                grad[p_idx][0] += h[0];
                grad[p_idx][1] += h[1];
                grad[p_idx][2] += h[2];
            }
        }
    }
    return grad;
}

export function integratePoints(points, g, dt, isPeriodic, maxDelta=0.02) {
  const out = new Array(points.length);
  for (let i=0;i<points.length;i++) {
    const p = points[i];
    const d = g[i];
    // Clamp step to avoid explosions
    const sx = dt*d[0], sy = dt*d[1], sz = dt*d[2];
    const sn = Math.hypot(sx, sy, sz) || 0;
    const k = sn > maxDelta ? (maxDelta / sn) : 1.0;
    let x = p[0] + k*sx;
    let y = p[1] + k*sy;
    let z = p[2] + k*sz;
    if (isPeriodic) {
      x = wrap01(x); y = wrap01(y); z = wrap01(z);
    }
    out[i] = [x,y,z];
  }
  return out;
}


