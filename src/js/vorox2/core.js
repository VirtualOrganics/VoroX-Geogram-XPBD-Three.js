// MIC helpers and centers computation (Phase 1)

export function wrap01(x) {
  let v = x;
  while (v < 0) v += 1;
  while (v >= 1) v -= 1;
  return v;
}

export function minImageDelta(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  for (let k = 0; k < 3; k++) {
    if (d[k] > 0.5) d[k] -= 1.0; else if (d[k] < -0.5) d[k] += 1.0;
  }
  return d;
}

export function minImagePoint(a, b) {
  // return b adjusted to the image closest to a
  const d = minImageDelta(a, b);
  return [a[0] + d[0], a[1] + d[1], a[2] + d[2]];
}

// Note: we intentionally avoid segment splitting. Consumers should render edges as
// a single segment from point a to minImagePoint(a, b), matching Geogram demo MIC.

function centroid4(a, b, c, d) {
  return [(a[0]+b[0]+c[0]+d[0])/4, (a[1]+b[1]+c[1]+d[1])/4, (a[2]+b[2]+c[2]+d[2])/4];
}

function det3(m) {
  return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
}

function circumcenter4(a, b, c, d) {
  const sub = (u, v) => [u[0]-v[0], u[1]-v[1], u[2]-v[2]];
  const dot = (u, v) => u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
  const ba = sub(b,a), ca = sub(c,a), da = sub(d,a);
  const A = [ [ba[0], ba[1], ba[2]], [ca[0], ca[1], ca[2]], [da[0], da[1], da[2]] ];
  const a2 = dot(a,a);
  const rhs = [0.5*(dot(b,b)-a2), 0.5*(dot(c,c)-a2), 0.5*(dot(d,d)-a2)];
  const detA = det3(A);
  if (!isFinite(detA) || Math.abs(detA) < 1e-12) return null;
  const Mx = [ [rhs[0], A[0][1], A[0][2]], [rhs[1], A[1][1], A[1][2]], [rhs[2], A[2][1], A[2][2]] ];
  const My = [ [A[0][0], rhs[0], A[0][2]], [A[1][0], rhs[1], A[1][2]], [A[2][0], rhs[2], A[2][2]] ];
  const Mz = [ [A[0][0], A[0][1], rhs[0]], [A[1][0], A[1][1], rhs[1]], [A[2][0], A[2][1], rhs[2]] ];
  const x = det3(Mx)/detA, y = det3(My)/detA, z = det3(Mz)/detA;
  
  // Robustness check: if any component is non-finite, the circumcenter is unstable.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  // --- VALIDATION LOGGING ---
  // Add a temporary check to see if we are generating huge, unstable centers.
  if (x < -1 || x > 2 || y < -1 || y > 2 || z < -1 || z > 2) {
    console.warn(`Unstable circumcenter detected: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}] with determinant ${detA.toExponential(2)}`);
  }
  // --- END VALIDATION ---

  // Aggressive stability check: if the center is far outside the typical domain,
  // it's a sign of a degenerate tetrahedron. Fallback to null.
  const limit = 10.0; // A circumcenter shouldn't be this far from the origin for a unit cube.
  if (Math.abs(x) > limit || Math.abs(y) > limit || Math.abs(z) > limit) {
    console.warn(`Unstable circumcenter detected and rejected: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]`);
    return null;
  }

  return [x,y,z];
}

export function computeCenters(pointsArray, tetrahedra, isPeriodic, method='centroid') {
  const centers = new Array(tetrahedra.length);
  for (let i=0;i<tetrahedra.length;i++) {
    const tet = tetrahedra[i];
    const p0 = pointsArray[tet[0]];
    const p1 = pointsArray[tet[1]];
    const p2 = pointsArray[tet[2]];
    const p3 = pointsArray[tet[3]];
    let c;
    if (method === 'circumcenter') {
      if (isPeriodic) {
        const ref = p0;
        const b = minImagePoint(ref, p1);
        const c2 = minImagePoint(ref, p2);
        const d = minImagePoint(ref, p3);
        c = circumcenter4(ref, b, c2, d);
        if (!c) c = centroid4(ref, b, c2, d); // Fallback if circumcenter fails
        c = [wrap01(c[0]), wrap01(c[1]), wrap01(c[2])];
      } else {
        c = circumcenter4(p0,p1,p2,p3) || centroid4(p0,p1,p2,p3);
      }
    } else {
      if (isPeriodic) {
        const ref = p0;
        const b = minImagePoint(ref, p1);
        const c2 = minImagePoint(ref, p2);
        const d = minImagePoint(ref, p3);
        c = centroid4(ref, b, c2, d);
        c = [wrap01(c[0]), wrap01(c[1]), wrap01(c[2])];
      } else {
        c = centroid4(p0,p1,p2,p3);
      }
    }
    centers[i] = c;
  }
  return centers;
}

export function buildFacetPairs(tetrahedra) {
  // Map each face triple to its two facets
  const faceMap = new Map();
  const facesOf = (tet) => [ [tet[0],tet[1],tet[2]], [tet[0],tet[1],tet[3]], [tet[0],tet[2],tet[3]], [tet[1],tet[2],tet[3]] ];
  const keyOf = (a,b,c)=> [a,b,c].slice().sort((x,y)=>x-y).join('-');
  for (let ti=0; ti<tetrahedra.length; ti++) {
    const tet = tetrahedra[ti];
    const faces = facesOf(tet);
    for (let fi=0; fi<4; fi++) {
      const k = keyOf(...faces[fi]);
      if (!faceMap.has(k)) faceMap.set(k, []);
      faceMap.get(k).push([fi, ti]);
    }
  }
  const pairs = Array.from({length: tetrahedra.length}, ()=>Array(4).fill(null));
  for (const list of faceMap.values()) {
    if (list.length === 2) {
      const [f1, f2] = list; // [fi, ti]
      pairs[f1[1]][f1[0]] = { face: f2[0], tet: f2[1] };
      pairs[f2[1]][f2[0]] = { face: f1[0], tet: f1[1] };
    }
  }
  return pairs;
}

/**
 * Computes the barycenter (average of vertices) of a single tetrahedron.
 * @param {number[][]} points - The array of all points in the system.
 * @param {number[]} tet - The indices of the four points forming the tetrahedron.
 * @returns {number[]} The [x, y, z] coordinates of the barycenter.
 */
export function barycenter(points, tet, isPeriodic = false) {
  const p0 = points[tet[0]];
  const p1 = points[tet[1]];
  const p2 = points[tet[2]];
  const p3 = points[tet[3]];

  if (isPeriodic) {
      // Use p0 as the reference point for the periodic image
      const ref = p0;
      // Function to adjust a point to be in the same periodic image as the reference
      const adjust = (p) => {
          const adj = [...p];
          for (let i = 0; i < 3; i++) {
              const d = p[i] - ref[i];
              if (d > 0.5) adj[i] -= 1.0;
              else if (d < -0.5) adj[i] += 1.0;
          }
          return adj;
      };
      
      const p1a = adjust(p1);
      const p2a = adjust(p2);
      const p3a = adjust(p3);

      let x = (ref[0] + p1a[0] + p2a[0] + p3a[0]) / 4;
      let y = (ref[1] + p1a[1] + p2a[1] + p3a[1]) / 4;
      let z = (ref[2] + p1a[2] + p2a[2] + p3a[2]) / 4;
      
      // Wrap the final calculated center back into the [0,1) cube
      x = x - Math.floor(x);
      y = y - Math.floor(y);
      z = z - Math.floor(z);

      return [x, y, z];
  } else {
    // Simple average for the non-periodic case
    return [
      (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
      (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
      (p0[2] + p1[2] + p2[2] + p3[2]) / 4,
    ];
  }
}

// Clip a 3D segment to the unit cube [0,1]^3. Returns [p', q'] or null.
export function clipSegmentToUnitCube(p, q) {
  const p0 = [p[0], p[1], p[2]];
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  let t0 = 0.0, t1 = 1.0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (p0[k] < 0 || p0[k] > 1) return null; // parallel outside
    } else {
      const invD = 1.0 / d[k];
      const tNear = (0 - p0[k]) * invD;
      const tFar  = (1 - p0[k]) * invD;
      const tMin = Math.min(tNear, tFar);
      const tMax = Math.max(tNear, tFar);
      if (tMin > t0) t0 = tMin;
      if (tMax < t1) t1 = tMax;
      if (t0 > t1) return null;
    }
  }
  const a = [p0[0] + t0 * d[0], p0[1] + t0 * d[1], p0[2] + t0 * d[2]];
  const b = [p0[0] + t1 * d[0], p0[1] + t1 * d[1], p0[2] + t1 * d[2]];
  return [a, b];
}


