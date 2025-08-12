import { minImagePoint, wrap01, barycenter } from './core.js';
import { buildVoronoiEdgeGraph, edgePageRank, computeEdgeBasedForces, calculateEdgeScoresMC } from './edgeGraph.js';
import { VerletIntegrator } from './verlet.js';

function vecSub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vecAdd(a,b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vecScale(a,s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function vecNorm(a){ return Math.hypot(a[0],a[1],a[2]); }

// Legacy tetrahedra-based scoring (kept for backward compatibility)
export function calculateScores(foam, depth) {
    const numTets = foam.simplices.length;
    if (numTets === 0) return [];

    let scores = Array(numTets).fill(1.0);
    
    for (let i = 0; i < depth; i++) {
        const nextScores = Array(numTets).fill(0.0);
        for (let j = 0; j < numTets; j++) {
            const outgoingLinks = foam.linkGraph[j].out;
            if (outgoingLinks.length > 0) {
                const contribution = scores[j] / outgoingLinks.length;
                for (const neighbor of outgoingLinks) {
                    nextScores[neighbor] += contribution;
                }
            }
        }
        // Damping factor could be added here for more PageRank-like behavior
        scores = nextScores;
    }
    return scores;
}

/**
 * NEW: Edge-based PageRank scoring system
 * Computes importance scores for Voronoi edges based on their connectivity
 * at obtuse angles, following the architecture in the diagrams
 */
export function calculateEdgeScores(foam, depth = 10, damping = 0.85) {
    // Build the Voronoi edge connectivity graph
    const edgeGraph = buildVoronoiEdgeGraph(foam);
    
    // Run PageRank on the edge graph
    const edgeScores = edgePageRank(edgeGraph, depth, damping);
    
    return {
        scores: edgeScores,
        graph: edgeGraph
    };
}

// New MC scoring wrapper with defaults
export function calculateEdgeScoresMonteCarlo(foam, L = 8, K = 64, alpha = 0.9) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const scores = calculateEdgeScoresMC(foam, L, K, alpha);
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return { scores, runtimeMs: (t1 - t0), graph: null };
}

function homothety(Δ, catchment, scale, energy, equilibration, contractive, expansive) {
    let h = 0.0;
    const n = vecNorm(Δ) || 1e-12;
    // Note: The direct contractive/expansive logic is now removed from here
    // as it's handled by the targeted forces.
    if (equilibration) h += 1 - (scale / n);
    return vecScale(Δ, energy * h);
}

export function simplexCatchment(foam, simplexIndex) {
  let catchment = 0.0;
  for (let fid=0; fid<4; fid++) {
    // Knot-based catchment removed; default to zero influence
    const d = 0;
    if (d === 0) {
      const k = foam.facetKnot[simplexIndex][fid];
      if (k > 0) {
        const len = 1;
        const nc = foam.numCatched[k-1] || 0;
        catchment += (len + nc) / len;
      }
    }
  }
  catchment /= 4; // number of facets in a tetrahedron
  return catchment;
}

/**
 * Compute gradient forces for the system
 * Now supports both legacy tetrahedra-based and new edge-based modes
 */
export function gradient(foam, options = {}) {
    const {
        useEdgeMode = false,     // Use new edge-based PageRank system
        edgeScores = null,       // Pre-computed edge scores
        edge_scale = false,
        scale = 1.0,
        energy = 0.1,
        equilibration = true,
        contractive = false,
        expansive = false,
        threshold = 0.5,
        searchDepth = 10
    } = options;
    
    const grad = Array.from({ length: foam.points.length }, () => [0,0,0]);
    
    // Step 1: Apply base equilibration forces
    if (equilibration) {
        const motion_centers = foam.simplices.map(tet => barycenter(foam.points, tet, foam.isPeriodic));
        for (let simplex_idx=0; simplex_idx<foam.simplices.length; simplex_idx++) {
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
                        const h = homothety(Δ, 0, scale, energy, true, false, false);
                        grad[p_idx] = vecAdd(grad[p_idx], h);
                    }
                } else {
                    const Δ = vecSub(c, p);
                    const h = homothety(Δ, 0, scale, energy, true, false, false);
                    grad[p_idx] = vecAdd(grad[p_idx], h);
                }
            }
        }
    }

    // Step 2: Apply targeted contractive/expansive forces
    if (useEdgeMode && (contractive || expansive)) {
        // Use edge-based PageRank scores
        let scores = edgeScores;
        if (!scores) {
            // Compute edge scores if not provided
            const result = calculateEdgeScores(foam, searchDepth);
            scores = result.scores;
        }
        
        // Apply edge-based deformation forces
        const edgeForces = computeEdgeBasedForces(foam, scores, threshold, contractive, expansive, energy);
        
        // Add to gradient
        for (let i = 0; i < foam.points.length; i++) {
            grad[i] = vecAdd(grad[i], edgeForces[i]);
        }
    }

    return grad;
}

// Legacy Euler integration (kept for backward compatibility)
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

/**
 * Create and manage a Verlet integrator for the system
 * Provides more stable physics than Euler integration
 */
export function createVerletSystem(numPoints, isPeriodic = false) {
    return new VerletIntegrator(numPoints, isPeriodic);
}


