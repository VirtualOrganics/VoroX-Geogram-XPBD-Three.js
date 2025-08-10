import { computeCenters, buildFacetPairs, minImagePoint } from './core.js';

export function facetDir(centers, from, to, isPeriodic) {
  const c1 = centers[from.tet];
  let c2 = centers[to.tet];
  if (isPeriodic) c2 = minImagePoint(c1, c2);
  const d = [c2[0]-c1[0], c2[1]-c1[1], c2[2]-c1[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  if (n === 0) return [0,0,0];
  return [d[0]/n, d[1]/n, d[2]/n];
}

export function computeActiveEdges(tetrahedra, centers, facetPairs, isPeriodic) {
  const active = Array.from({length: tetrahedra.length}, ()=>Array(4).fill(null));
  for (let ti=0; ti<tetrahedra.length; ti++) {
    for (let fi=0; fi<4; fi++) {
      const mirror = facetPairs[ti][fi];
      if (!mirror) continue;
      let best = null, bestDot = -1;
      const dir = facetDir(centers, {tet:ti, face:fi}, mirror, isPeriodic);
      const simplex = mirror.tet;
      for (let candFace=0; candFace<4; candFace++) {
        if (candFace === mirror.face) continue;
        const nextNext = facetPairs[simplex][candFace];
        if (!nextNext) continue;
        const ndir = facetDir(centers, mirror, nextNext, isPeriodic);
        const dot = dir[0]*ndir[0] + dir[1]*ndir[1] + dir[2]*ndir[2];
        if (dot > bestDot) { bestDot = dot; best = { tet: simplex, face: candFace }; }
      }
      active[ti][fi] = best;
    }
  }
  return active;
}

export function detectKnots(activeEdges) {
  const T = activeEdges.length;
  const visited = Array.from({length:T}, ()=>Array(4).fill(false));
  const facetKnot = Array.from({length:T}, ()=>Array(4).fill(0));
  const knotDist = Array.from({length:T}, ()=>Array(4).fill(0));
  const knots = [];
  const numCatched = [];

  function eq(a,b){ return a && b && a.tet===b.tet && a.face===b.face; }

  for (let ti=0; ti<T; ti++) {
    for (let fi=0; fi<4; fi++) {
      if (visited[ti][fi]) continue;
      const path = [{tet:ti, face:fi}];
      const index = new Map(); index.set(`${ti}:${fi}`, 1);
      let cur = activeEdges[ti][fi];
      while (cur && !visited[cur.tet][cur.face] && !index.has(`${cur.tet}:${cur.face}`)) {
        path.push(cur);
        index.set(`${cur.tet}:${cur.face}`, path.length);
        cur = activeEdges[cur.tet][cur.face];
      }
      let startKnot, targetKnot;
      if (!cur) {
        startKnot = path.length + 1; targetKnot = 0;
      } else if (visited[cur.tet][cur.face]) {
        startKnot = path.length + 1 + knotDist[cur.tet][cur.face];
        targetKnot = facetKnot[cur.tet][cur.face];
      } else {
        startKnot = index.get(`${cur.tet}:${cur.face}`);
        knots.push(path.slice(startKnot-1));
        numCatched.push(0);
        targetKnot = knots.length;
      }
      for (let i=0;i<path.length;i++) {
        const f = path[i];
        visited[f.tet][f.face] = true;
        facetKnot[f.tet][f.face] = targetKnot;
        if (i+1 < startKnot) {
          knotDist[f.tet][f.face] = startKnot - (i+1);
          if (targetKnot) numCatched[targetKnot-1] += 1;
        }
      }
    }
  }
  return { knots, facetKnot, knotDist, numCatched };
}

export function buildFoam({ pointsArray, tetrahedra, isPeriodic, centering='centroid' }) {
  const centers = computeCenters(pointsArray, tetrahedra, isPeriodic, centering);
  const facetPairs = buildFacetPairs(tetrahedra);
  const activeEdges = computeActiveEdges(tetrahedra, centers, facetPairs, isPeriodic);
  const { knots, facetKnot, knotDist, numCatched } = detectKnots(activeEdges);
  return { points: pointsArray, simplices: tetrahedra, centers, facetPairs, activeEdges, knots, facetKnot, knotDist, numCatched, isPeriodic };
}


