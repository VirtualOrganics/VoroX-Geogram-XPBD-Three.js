import { minImagePoint, wrap01 } from './core.js';

function vecSub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vecAdd(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vecScale(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function vecNorm(a){ return Math.hypot(a[0],a[1],a[2]); }

function homothety(Delta, catchment, scale, energy, equilibration, contractive, expansive) {
  const n = vecNorm(Delta) || 1e-12;
  let h = 0.0;
  if (equilibration) h += 1 - (scale / n);
  if (contractive)  h += 1 - (scale / n) * (1 - catchment);
  if (expansive)    h += 1 - (scale / n) * catchment;
  return vecScale(Delta, energy * h);
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

export function gradient(foam, edgeScale, scale, energy, equilibration, contractive, expansive) {
  const points = foam.points;
  const tets = foam.simplices;
  const isPeriodic = foam.isPeriodic;
  const out = Array.from({length: points.length}, ()=>[0,0,0]);

  for (let si=0; si<tets.length; si++) {
    const tet = tets[si];
    const pIdxs = tet;
    const ps = pIdxs.map(i => points[i]);
    const catchment = simplexCatchment(foam, si);

    // centroid of simplex (use MIC to keep close)
    let c = ps[0];
    if (isPeriodic) {
      const b = minImagePoint(c, ps[1]);
      const d = minImagePoint(c, ps[2]);
      const e = minImagePoint(c, ps[3]);
      c = [(c[0]+b[0]+d[0]+e[0])/4, (c[1]+b[1]+d[1]+e[1])/4, (c[2]+b[2]+d[2]+e[2])/4];
    } else {
      c = [ (ps[0][0]+ps[1][0]+ps[2][0]+ps[3][0])/4, (ps[0][1]+ps[1][1]+ps[2][1]+ps[3][1])/4, (ps[0][2]+ps[1][2]+ps[2][2]+ps[3][2])/4 ];
    }

    for (let a=0; a<4; a++) {
      const i = pIdxs[a];
      const p = ps[a];
      let contrib = [0,0,0];
      if (edgeScale) {
        for (let b=0; b<4; b++) if (b!==a) {
          const q = isPeriodic ? minImagePoint(p, ps[b]) : ps[b];
          const Delta = vecSub(q, p);
          contrib = vecAdd(contrib, homothety(Delta, catchment, scale, energy, equilibration, contractive, expansive));
        }
      } else {
        const q = isPeriodic ? minImagePoint(p, c) : c;
        const Delta = vecSub(q, p);
        contrib = vecAdd(contrib, homothety(Delta, catchment, scale, energy, equilibration, contractive, expansive));
      }
      out[i] = vecAdd(out[i], contrib);
    }
  }

  return out;
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


