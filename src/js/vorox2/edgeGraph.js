/**
 * Edge-based graph system for Voronoi edge PageRank
 * This implements the architecture shown in the diagrams:
 * - Voronoi edges are nodes in the graph
 * - Links exist between edges that meet at obtuse angles
 * - PageRank computes importance scores for flow pathways
 */

import { barycenter, minImagePoint } from './core.js';

/**
 * Compute angle between two vectors in 3D
 * Returns angle in radians [0, π]
 */
function angleBetweenVectors(v1, v2) {
    const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
    const mag1 = Math.sqrt(v1[0]*v1[0] + v1[1]*v1[1] + v1[2]*v1[2]);
    const mag2 = Math.sqrt(v2[0]*v2[0] + v2[1]*v2[1] + v2[2]*v2[2]);
    
    if (mag1 < 1e-10 || mag2 < 1e-10) return 0;
    
    const cosAngle = dot / (mag1 * mag2);
    // Clamp to avoid numerical errors with acos
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));
    return Math.acos(clampedCos);
}

/**
 * Build the Voronoi edge connectivity graph
 * Each Voronoi edge becomes a node in our graph
 * Edges are connected if they share a vertex and form an obtuse angle
 */
export function buildVoronoiEdgeGraph(foam) {
    // First, we need to identify which Voronoi edges share vertices
    // A Voronoi edge connects two tetrahedra centers
    
    const edgeGraph = {
        nodes: [],      // Each node is a Voronoi edge
        links: [],      // Connections between edges
        edgeToIndex: new Map(), // Map from edge key to node index
        edgeToFace: new Map()   // Map from edge to Delaunay face it crosses
    };
    
    // Build a map of tetrahedron centers to edges that connect to them
    const centerToEdges = new Map();
    
    // Process each Voronoi edge (stored as pairs of tetrahedra indices)
    foam.voronoiEdges?.forEach((edgePair, edgeIdx) => {
        // edgePair is [tet1Idx, tet2Idx]
        const tet1Idx = edgePair[0];
        const tet2Idx = edgePair[1];
        
        if (!foam.centers || !foam.centers[tet1Idx] || !foam.centers[tet2Idx]) return;
        
        // Create edge node
        const edgeKey = `${Math.min(tet1Idx, tet2Idx)}-${Math.max(tet1Idx, tet2Idx)}`;
        const edgeNode = {
            index: edgeIdx,
            tet1: tet1Idx,
            tet2: tet2Idx,
            start: foam.centers[tet1Idx],
            end: foam.centers[tet2Idx],
            key: edgeKey
        };
        
        edgeGraph.nodes.push(edgeNode);
        edgeGraph.edgeToIndex.set(edgeKey, edgeGraph.nodes.length - 1);
        
        // Track which edges connect to each tetrahedron center
        if (!centerToEdges.has(tet1Idx)) centerToEdges.set(tet1Idx, []);
        if (!centerToEdges.has(tet2Idx)) centerToEdges.set(tet2Idx, []);
        centerToEdges.get(tet1Idx).push(edgeGraph.nodes.length - 1);
        centerToEdges.get(tet2Idx).push(edgeGraph.nodes.length - 1);
        
        // Use the pre-computed face mapping from foam
        if (foam.voronoiEdgeToDelaunayFace) {
            const face = foam.voronoiEdgeToDelaunayFace.get(edgeKey);
            if (face) {
                edgeGraph.edgeToFace.set(edgeKey, face);
            }
        }
    });
    
    // Now build connections between edges that meet at vertices
    // and form obtuse angles (> 90 degrees)
    centerToEdges.forEach((edgeIndices, centerIdx) => {
        // For each pair of edges meeting at this center
        for (let i = 0; i < edgeIndices.length; i++) {
            for (let j = i + 1; j < edgeIndices.length; j++) {
                const edge1 = edgeGraph.nodes[edgeIndices[i]];
                const edge2 = edgeGraph.nodes[edgeIndices[j]];
                
                // Compute vectors from center to other endpoints
                const center = foam.centers[centerIdx];
                if (!center) continue;
                
                const v1 = edge1.tet1 === centerIdx ? 
                    [edge1.end[0] - center[0], edge1.end[1] - center[1], edge1.end[2] - center[2]] :
                    [edge1.start[0] - center[0], edge1.start[1] - center[1], edge1.start[2] - center[2]];
                    
                const v2 = edge2.tet1 === centerIdx ?
                    [edge2.end[0] - center[0], edge2.end[1] - center[1], edge2.end[2] - center[2]] :
                    [edge2.start[0] - center[0], edge2.start[1] - center[1], edge2.start[2] - center[2]];
                
                const angle = angleBetweenVectors(v1, v2);
                
                // Connect if angle is obtuse (> 90 degrees = π/2 radians)
                if (angle > Math.PI / 2) {
                    edgeGraph.links.push({
                        source: edgeIndices[i],
                        target: edgeIndices[j],
                        angle: angle
                    });
                }
            }
        }
    });
    
    return edgeGraph;
}

/**
 * Find the shared triangular face between two tetrahedra
 * Returns array of 3 vertex indices or null
 */
function findSharedFace(tet1, tet2) {
    const shared = [];
    for (const v1 of tet1) {
        if (tet2.includes(v1)) {
            shared.push(v1);
        }
    }
    // A shared face in 3D has exactly 3 vertices
    return shared.length === 3 ? shared : null;
}

/**
 * Run PageRank on the Voronoi edge graph
 * This computes importance scores for each edge based on connectivity
 * 
 * @param {Object} edgeGraph - The edge connectivity graph
 * @param {number} iterations - Number of PageRank iterations (search depth)
 * @param {number} damping - Damping factor (typically 0.85)
 * @returns {Map} Map from edge key to score
 */
export function edgePageRank(edgeGraph, iterations = 10, damping = 0.85) {
    const numNodes = edgeGraph.nodes.length;
    if (numNodes === 0) return new Map();
    
    // Initialize scores to 1.0 for all edges
    let scores = new Array(numNodes).fill(1.0);
    
    // Build adjacency lists for efficient iteration
    const outgoing = Array.from({length: numNodes}, () => []);
    const incoming = Array.from({length: numNodes}, () => []);
    
    edgeGraph.links.forEach(link => {
        outgoing[link.source].push(link.target);
        outgoing[link.target].push(link.source); // Bidirectional
        incoming[link.target].push(link.source);
        incoming[link.source].push(link.target);
    });
    
    // PageRank iterations
    for (let iter = 0; iter < iterations; iter++) {
        const newScores = new Array(numNodes).fill(0);
        
        // Each node distributes its score to neighbors
        for (let i = 0; i < numNodes; i++) {
            if (outgoing[i].length > 0) {
                const contribution = scores[i] / outgoing[i].length;
                for (const neighbor of outgoing[i]) {
                    newScores[neighbor] += contribution;
                }
            } else {
                // Nodes with no outgoing links distribute evenly
                const contribution = scores[i] / numNodes;
                for (let j = 0; j < numNodes; j++) {
                    newScores[j] += contribution;
                }
            }
        }
        
        // Apply damping factor and add random jump probability
        for (let i = 0; i < numNodes; i++) {
            scores[i] = (1 - damping) / numNodes + damping * newScores[i];
        }
    }
    
    // Debug output (only if scores show low variance)
    const variance = scores.reduce((acc, s, i, arr) => {
        const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
        return acc + Math.pow(s - mean, 2);
    }, 0) / scores.length;
    
    if (variance < 0.001) {
        console.warn('Low variance in PageRank scores:', variance);
        console.log('This may indicate a very uniform mesh or insufficient iterations');
    }
    
    // Normalize scores to [0, 1] range
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;
    
    // Convert to Map with edge keys
    const scoreMap = new Map();
    edgeGraph.nodes.forEach((node, idx) => {
        const normalizedScore = (scores[idx] - minScore) / range;
        scoreMap.set(node.key, normalizedScore);
    });
    
    return scoreMap;
}

/**
 * Build directional half-edge adjacency at obtuse gates.
 * - Each Voronoi edge (t1, t2) creates two half-edges: (to t1) and (to t2)
 * - At each center C, connect incoming half-edges to outgoing half-edges when the turn angle is obtuse
 */
export function buildHalfEdgeAdjacency(foam) {
    const centers = foam.centers;
    const isPeriodic = !!foam.isPeriodic;
    const edgePairs = foam.voronoiEdges || [];

    // Half-edge structure
    // halfEdges[h] = { edgeKey, fromTet, toTet, atCenter } where atCenter == toTet (current node)
    const halfEdges = [];
    const edgeKeyToHalf = new Map(); // key -> [hToTet1, hToTet2]

    function makeEdgeKey(a, b) {
        return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    // Create half-edges
    for (const pair of edgePairs) {
        const t1 = pair[0];
        const t2 = pair[1];
        if (!centers || !centers[t1] || !centers[t2]) continue;
        const key = makeEdgeKey(t1, t2);
        const h1 = { edgeKey: key, fromTet: t2, toTet: t1, atCenter: t1 };
        const h2 = { edgeKey: key, fromTet: t1, toTet: t2, atCenter: t2 };
        const idx1 = halfEdges.push(h1) - 1;
        const idx2 = halfEdges.push(h2) - 1;
        edgeKeyToHalf.set(key, [idx1, idx2]);
    }

    // Map center -> incident half-edges (those whose atCenter == center)
    const centerToHalf = new Map();
    for (let h = 0; h < halfEdges.length; h++) {
        const he = halfEdges[h];
        if (!centerToHalf.has(he.atCenter)) centerToHalf.set(he.atCenter, []);
        centerToHalf.get(he.atCenter).push(h);
    }

    // Build adjacency based on obtuse angles at each center
    const adj = Array.from({ length: halfEdges.length }, () => []);

    function vec(a, b) {
        // vector from a to b, respecting periodic MIC if needed
        return isPeriodic ? (minImagePoint(a, b).map((v, i) => v - a[i])) : [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    }

    function angleBetween(u, v) {
        const dot = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
        const nu = Math.hypot(u[0],u[1],u[2]) || 1e-12;
        const nv = Math.hypot(v[0],v[1],v[2]) || 1e-12;
        const c = Math.max(-1, Math.min(1, dot/(nu*nv)));
        return Math.acos(c);
    }

    centerToHalf.forEach((incident, cIdx) => {
        const C = centers[cIdx];
        if (!C) return;
        // Precompute v_in for each half-edge entering C: from other center to C
        const vin = new Map();
        for (const hIn of incident) {
            const he = halfEdges[hIn];
            const other = centers[he.fromTet];
            if (!other) continue;
            const v = vec(other, C);
            vin.set(hIn, v);
        }
        // For each ordered pair (hIn -> hOut) at C
        for (const hIn of incident) {
            const v_in = vin.get(hIn);
            if (!v_in) continue;
            let total = 0;
            const candidates = [];
            for (const hOut of incident) {
                if (hOut === hIn) continue;
                // Optional: prevent immediate backtrack to same undirected edge
                if (halfEdges[hOut].edgeKey === halfEdges[hIn].edgeKey) continue;
                const heOut = halfEdges[hOut];
                const other = centers[heOut.fromTet]; // leaving C towards other center
                if (!other) continue;
                const v_out = vec(C, other);
                const theta = angleBetween(v_in, v_out);
                if (theta <= Math.PI/2 + 1e-6) continue; // keep strictly obtuse
                // weight options: use cosine-based: w = max(0, -cosθ)
                const w = Math.max(0, -Math.cos(theta));
                if (w <= 0) continue;
                candidates.push([hOut, w]);
                total += w;
            }
            if (total > 0) {
                for (const [to, w] of candidates) {
                    adj[hIn].push({ to, p: w/total });
                }
            }
        }
    });

    return { halfEdges, adj, edgeKeyToHalf };
}

/**
 * Monte Carlo directional truncated random-walk scoring for Voronoi edges
 * Returns Map<edgeKey, score in [0,1]>
 */
export function calculateEdgeScoresMC(foam, L = 8, K = 64, alpha = 0.9, options = {}) {
    const { halfEdges, adj, edgeKeyToHalf } = buildHalfEdgeAdjacency(foam);
    const edgeKeys = Array.from(edgeKeyToHalf.keys());
    if (edgeKeys.length === 0) return new Map();
    const useFirstVisit = options.useFirstVisit === undefined ? false : !!options.useFirstVisit;
    const combine = options.combine || 'harmonic'; // 'harmonic' | 'min'
    const fanoutCap = options.fanoutCap || null;   // { topM?, cumProb? }

    // For each half-edge, run K walkers up to L steps; accumulate survival
    function hashStr(s) {
        // Simple Fowler–Noll–Vo (FNV-1a) 32-bit
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
        return h >>> 0;
    }
    function lcg(seed) {
        // Deterministic LCG: Numerical Recipes (mod 2^32)
        let x = seed >>> 0;
        return () => {
            x = (1664525 * x + 1013904223) >>> 0;
            return (x >>> 8) / 16777216; // [0,1)
        };
    }

    function simulateFrom(hStart, seedBase) {
        let totalMass = 0; // accumulated arrival mass across network
        // Initialize K walkers each with weight 1/K at hStart
        const walkers = new Array(K).fill(0).map((_, wi) => ({ h: hStart, w: 1.0 / K, alive: true, rng: lcg((seedBase ^ wi) >>> 0), visited: useFirstVisit ? new Set() : null }));
        for (let step = 1; step <= L; step++) {
            for (const wkr of walkers) {
                if (!wkr.alive) continue;
                let outs = adj[wkr.h];
                if (!outs || outs.length === 0) { wkr.alive = false; continue; }
                // Optional fan-out cap
                if (fanoutCap) {
                    const sorted = [...outs].sort((a,b)=>b.p-a.p);
                    if (fanoutCap.topM) outs = sorted.slice(0, Math.max(1, fanoutCap.topM|0));
                    else if (fanoutCap.cumProb) { let accp=0; const tmp=[]; for (const o of sorted){ tmp.push(o); accp+=o.p; if (accp>=Math.min(0.999, Math.max(0.1, fanoutCap.cumProb))) break; } outs = tmp; }
                }
                // sample next via roulette among possibly capped outs
                const r = wkr.rng();
                let acc = 0, chosen = outs[outs.length-1];
                for (const o of outs) { acc += o.p; if (r <= acc) { chosen = o; break; } }
                wkr.h = chosen.to;
                // apply discount and turn weight
                wkr.w *= (alpha * (chosen.p || 0));
                if (wkr.w < 1e-12) { wkr.alive = false; continue; }
                // arrival accounting to undirected edge key of current half-edge
                const key = halfEdges[wkr.h].edgeKey;
                if (useFirstVisit) {
                    if (!wkr.visited.has(key)) { totalMass += wkr.w; wkr.visited.add(key); }
                } else {
                    totalMass += wkr.w;
                }
            }
        }
        return totalMass; // larger means more accessible network mass
    }

    // Compute directional scores per edge (min of two sides)
    const raw = new Map();
    for (const [edgeKey, [h1, h2]] of edgeKeyToHalf.entries()) {
        const seedBase = hashStr(edgeKey) >>> 0;
        const d1 = simulateFrom(h1, seedBase ^ 0x9e3779b9);
        const d2 = simulateFrom(h2, seedBase ^ 0x85ebca6b);
        let scoreRaw;
        if (combine === 'harmonic') {
            scoreRaw = (d1>0 && d2>0) ? (2*d1*d2)/(d1+d2) : 0;
        } else {
            scoreRaw = Math.min(d1, d2);
        }
        raw.set(edgeKey, scoreRaw);
    }

    // Normalize to [0,1]
    const vals = Array.from(raw.values());
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = (max - min) || 1;
    const out = new Map();
    for (const [k, v] of raw.entries()) out.set(k, (v - min) / range);
    return out;
}

/**
 * Apply deformation forces based on edge scores
 * Low-scoring edges cause their dual Delaunay faces to contract
 * High-scoring edges cause expansion
 */
export function computeEdgeBasedForces(foam, edgeScores, threshold, contractive, expansive, strength = 0.1) {
    const forces = Array.from({length: foam.points.length}, () => [0, 0, 0]);
    
    // Use cached edge->face map on foam if available; else build once and cache
    if (!foam.__edgeFaceMapCache) {
        const g = buildVoronoiEdgeGraph(foam);
        foam.__edgeFaceMapCache = g.edgeToFace; // Map edgeKey -> face [i,j,k]
    }
    const edgeToFace = foam.__edgeFaceMapCache;
    
    edgeScores.forEach((score, edgeKey) => {
        const face = edgeToFace.get(edgeKey);
        if (!face) return;
        
        // Determine if we should contract or expand this face
        let scaleFactor = 0;
        if (contractive && score < threshold) {
            // Contract: pull vertices toward face center
            scaleFactor = -strength * (threshold - score);
        } else if (expansive && score > threshold) {
            // Expand: push vertices away from face center
            scaleFactor = strength * (score - threshold);
        }
        
        if (Math.abs(scaleFactor) < 1e-6) return;
        
        // Compute face centroid
        const facePoints = face.map(idx => foam.points[idx]);
        const centroid = [
            (facePoints[0][0] + facePoints[1][0] + facePoints[2][0]) / 3,
            (facePoints[0][1] + facePoints[1][1] + facePoints[2][1]) / 3,
            (facePoints[0][2] + facePoints[1][2] + facePoints[2][2]) / 3
        ];
        
        // Apply forces to face vertices
        face.forEach((vertIdx, i) => {
            const vertex = facePoints[i];
            const direction = [
                centroid[0] - vertex[0],
                centroid[1] - vertex[1],
                centroid[2] - vertex[2]
            ];
            
            // Normalize and scale
            const mag = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2) || 1;
            // Clamp per-vertex contribution to avoid spikes
            const dx = scaleFactor * direction[0] / mag;
            const dy = scaleFactor * direction[1] / mag;
            const dz = scaleFactor * direction[2] / mag;
            const maxStep = 0.05; // conservative clamp before integrator
            const n = Math.hypot(dx,dy,dz) || 0;
            const k = n > maxStep ? (maxStep / n) : 1.0;
            forces[vertIdx][0] += k*dx;
            forces[vertIdx][1] += k*dy;
            forces[vertIdx][2] += k*dz;
        });
    });
    
    return forces;
}
