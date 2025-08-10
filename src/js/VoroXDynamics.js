/**
 * VoroX Dynamics (simplified): builds an active facet flow graph based on center directions.
 * - Uses Delaunay tetrahedra, centers (barycenters or circumcenters) and face adjacency
 * - For each facet, points to the next facet that maximizes the directional cosine (as in foam.jl)
 * - Returns { activeEdges, knots, facetToKnot, knotDist }
 */

export function buildVoroXFlow({ tetrahedra, centers, faceAdjacency }) {
  const numTets = tetrahedra.length;
  if (numTets === 0) {
    return { activeEdges: [], knots: [], facetToKnot: [], knotDist: [] };
  }

  // Helper to get vector diff
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const norm = (u) => Math.hypot(u[0], u[1], u[2]) || 1;
  const normalize = (u) => {
    const n = norm(u);
    return [u[0] / n, u[1] / n, u[2] / n];
  };

  // Map each facet (ti, fi) to its mirror facet via adjacency
  const mirrorOf = (ti, fi) => (faceAdjacency[ti] && faceAdjacency[ti][fi]) || null;

  // For each facet, choose the next facet maximizing the cosine between directions
  // Direction from center of current tet to center of adjacent tet across the facet
  const activeEdges = Array.from({ length: numTets }, () => Array(4).fill(null));

  for (let ti = 0; ti < numTets; ti++) {
    for (let fi = 0; fi < 4; fi++) {
      const mir = mirrorOf(ti, fi);
      if (!mir) continue; // boundary facet

      const cFrom = centers[ti];
      const cTo = centers[mir.tet];
      let dir = normalize(sub(cTo, cFrom));

      let bestFacet = null;
      let bestDot = -Infinity;

      // From the mirror's tet, evaluate all its faces (except the one pointing back)
      for (let nextFi = 0; nextFi < 4; nextFi++) {
        const mir2 = mirrorOf(mir.tet, nextFi);
        if (!mir2) continue;
        // Skip going directly back
        if (mir2.tet === ti && mir2.face === fi) continue;

        const cFrom2 = centers[mir.tet];
        const cTo2 = centers[mir2.tet];
        const dir2 = normalize(sub(cTo2, cFrom2));
        const cos = dot(dir, dir2);
        if (cos > bestDot) {
          bestDot = cos;
          bestFacet = { tet: mir.tet, face: nextFi };
        }
      }

      activeEdges[ti][fi] = bestFacet; // may be null if degenerate
    }
  }

  // Extract knots (cycles) and distances to knots
  const visited = Array.from({ length: numTets }, () => Array(4).fill(false));
  const facetToKnot = Array.from({ length: numTets }, () => Array(4).fill(0));
  const knotDist = Array.from({ length: numTets }, () => Array(4).fill(0));
  const knots = []; // each knot is an array of { tet, face }

  for (let ti = 0; ti < numTets; ti++) {
    for (let fi = 0; fi < 4; fi++) {
      if (visited[ti][fi]) continue;
      const path = [];
      const indexByFacet = new Map();

      let cur = { tet: ti, face: fi };
      while (cur && !visited[cur.tet][cur.face] && !indexByFacet.has(`${cur.tet}-${cur.face}`)) {
        indexByFacet.set(`${cur.tet}-${cur.face}`, path.length);
        path.push(cur);
        cur = activeEdges[cur.tet][cur.face];
      }

      let startKnot = path.length;
      let targetKnotIndex = 0;
      if (cur && indexByFacet.has(`${cur.tet}-${cur.face}`)) {
        startKnot = indexByFacet.get(`${cur.tet}-${cur.face}`);
        const knot = path.slice(startKnot);
        knots.push(knot);
        targetKnotIndex = knots.length;
      }

      for (let i = 0; i < path.length; i++) {
        const f = path[i];
        visited[f.tet][f.face] = true;
        facetToKnot[f.tet][f.face] = targetKnotIndex;
        if (i < startKnot) {
          knotDist[f.tet][f.face] = startKnot - i;
        } else {
          knotDist[f.tet][f.face] = 0; // on the knot
        }
      }
    }
  }

  return { activeEdges, knots, facetToKnot, knotDist };
}


