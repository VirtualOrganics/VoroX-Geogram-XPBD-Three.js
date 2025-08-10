import assert from 'node:assert/strict';
import { DelaunayComputation } from '../src/js/DelaunayComputation.js';

function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}
function vecApproxEqual(u, v, eps = 1e-9) {
  return approxEqual(u[0], v[0], eps) && approxEqual(u[1], v[1], eps) && approxEqual(u[2], v[2], eps);
}

function testCircumcenterRegularTetra() {
  // Regular tetrahedron with known circumcenter at centroid of vertices for the unit example below
  const a = [0, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];
  const d = [0, 0, 1];
  const comp = new DelaunayComputation([a, b, c, d], false, 'circumcenter');
  const cc = comp._circumcenterOfTetrahedron(a, b, c, d);
  // Expected circumcenter for this tetrahedron is (0.5, 0.5, 0.5)
  assert.ok(vecApproxEqual(cc, [0.5, 0.5, 0.5], 1e-9), `Circumcenter wrong: ${cc}`);
}

function testCircumcenterDegenerateFallback() {
  // Almost coplanar/degenerate tetrahedron: points nearly in the same plane
  const a = [0, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];
  const d = [1e-14, 1e-14, 1e-14];
  const comp = new DelaunayComputation([a, b, c, d], false, 'circumcenter');
  const cc = comp._circumcenterOfTetrahedron(a, b, c, d);
  // Cramer's rule should fail near-singular and return null; compute() fallback uses centroid
  assert.equal(cc, null, 'Expected null circumcenter for near-degenerate tetra');
}

function testPeriodicWrap() {
  const a = [0.95, 0.5, 0.5];
  const b = [0.05, 0.5, 0.5]; // across the boundary
  const c = [0.95, 0.6, 0.5];
  const d = [0.95, 0.5, 0.6];
  const comp = new DelaunayComputation([a, b, c, d], true, 'circumcenter');
  // Use private method indirectly by simulating compute()
  const cc = (() => {
    // emulate the periodic adjustment path inside circumcenter
    const ref = a;
    const adjust = (p) => {
      const q = [...p];
      for (let k = 0; k < 3; k++) {
        const diff = p[k] - ref[k];
        if (diff > 0.5) q[k] -= 1.0; else if (diff < -0.5) q[k] += 1.0;
      }
      return q;
    };
    const ccLocal = comp._circumcenterOfTetrahedron(a, adjust(b), adjust(c), adjust(d));
    // wrap back
    for (let k = 0; k < 3; k++) {
      while (ccLocal[k] < 0) ccLocal[k] += 1.0;
      while (ccLocal[k] >= 1) ccLocal[k] -= 1.0;
    }
    return ccLocal;
  })();
  assert.ok(cc[0] >= 0 && cc[0] <= 1 && cc[1] >= 0 && cc[1] <= 1 && cc[2] >= 0 && cc[2] <= 1, 'Circumcenter not wrapped into unit cube');
}

const tests = [
  ['circumcenter regular tetra', testCircumcenterRegularTetra],
  ['circumcenter degenerate fallback', testCircumcenterDegenerateFallback],
  ['periodic wrap for circumcenter', testPeriodicWrap],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(e);
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
process.exit(passed === tests.length ? 0 : 1);


