import { computeCenters, buildFacetPairs, minImagePoint } from './core.js';

function getVoronoiEdgeDir(centers, from_tet_idx, to_tet_idx, isPeriodic) {
  const c1 = centers[from_tet_idx];
  const c2_raw = centers[to_tet_idx];
  if (!c1 || !c2_raw) return null;
  const c2 = isPeriodic ? minImagePoint(c1, c2_raw) : c2_raw;
  const d = [c2[0]-c1[0], c2[1]-c1[1], c2[2]-c1[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  if (n < 1e-9) return null;
  return [d[0]/n, d[1]/n, d[2]/n];
}

export function buildLinkGraph(tetrahedra, centers, facetPairs, isPeriodic) {
  const numTets = tetrahedra.length;
  const graph = Array.from({ length: numTets }, () => ({ in: [], out: [] }));

  for (let t1_idx = 0; t1_idx < numTets; t1_idx++) {
    for (let f1_idx = 0; f1_idx < 4; f1_idx++) {
      const mirror1 = facetPairs[t1_idx][f1_idx];
      if (!mirror1) continue;
      const t2_idx = mirror1.tet;
      
      const incoming_dir = getVoronoiEdgeDir(centers, t1_idx, t2_idx, isPeriodic);
      if (!incoming_dir) continue;
      
      for (let f2_idx = 0; f2_idx < 4; f2_idx++) {
        if (f2_idx === mirror1.face) continue;
        
        const mirror2 = facetPairs[t2_idx][f2_idx];
        if (!mirror2) continue;
        const t3_idx = mirror2.tet;

        const outgoing_dir = getVoronoiEdgeDir(centers, t2_idx, t3_idx, isPeriodic);
        if (!outgoing_dir) continue;

        const dot = incoming_dir[0]*outgoing_dir[0] + incoming_dir[1]*outgoing_dir[1] + incoming_dir[2]*outgoing_dir[2];
        
        if (dot < 0) { // OBTUSE = LET FLOW (CONNECT)
          graph[t1_idx].out.push({ from: f1_idx, to: mirror1.face, targetTet: t2_idx });
        }
      }
    }
  }

  // Simplified graph for PageRank
  const simpleGraph = Array.from({ length: numTets }, () => ({ in: [], out: [] }));
  for (let i = 0; i < numTets; i++) {
      for(let j=0; j < graph[i].out.length; j++) {
        const target = graph[i].out[j].targetTet;
        if (!simpleGraph[i].out.includes(target)) simpleGraph[i].out.push(target);
        if (!simpleGraph[target].in.includes(i)) simpleGraph[target].in.push(i);
      }
  }

  return simpleGraph;
}

export function buildFoam({ pointsArray, tetrahedra, isPeriodic, centering='centroid' }) {
  const centers = computeCenters(pointsArray, tetrahedra, isPeriodic, centering);
  const facetPairs = buildFacetPairs(tetrahedra);
  
  const voronoiEdgeToDelaunayFace = new Map();
  const delaunayFaceToVoronoiEdge = new Map();
  const voronoiEdges = [];

  for (let t1_idx = 0; t1_idx < tetrahedra.length; t1_idx++) {
      const tet1 = tetrahedra[t1_idx];
      for (let f1_idx = 0; f1_idx < 4; f1_idx++) {
          const mirror = facetPairs[t1_idx][f1_idx];
          if (!mirror) continue;
          const t2_idx = mirror.tet;
          
          if (t1_idx < t2_idx) {
              const faceVertices = tet1.filter((_, i) => i !== f1_idx);
              const edgeKey = `${t1_idx}-${t2_idx}`;
              voronoiEdgeToDelaunayFace.set(edgeKey, faceVertices);
              
              const faceKey = faceVertices.slice().sort().join('-');
              delaunayFaceToVoronoiEdge.set(faceKey, [t1_idx, t2_idx]);

              voronoiEdges.push([t1_idx, t2_idx]);
          }
      }
  }

  const linkGraph = buildLinkGraph(tetrahedra, centers, facetPairs, isPeriodic);
  
  return { 
    points: pointsArray, 
    simplices: tetrahedra, 
    centers, 
    facetPairs,
    voronoiEdges,
    voronoiEdgeToDelaunayFace,
    delaunayFaceToVoronoiEdge,
    linkGraph,
    isPeriodic 
  };
}

// Lightweight topology/content signature; avoids full recompute when unchanged
export function buildFoamHash(foam) {
  if (!foam) return 0;
  const periodic = foam.isPeriodic ? 1 : 0;
  const np = foam.points?.length || 0;
  const nt = foam.simplices?.length || 0;
  const ve = foam.voronoiEdges?.length || 0;
  // sample a subset of voronoi edge keys for stability
  let keyAcc = 0;
  if (foam.voronoiEdges && foam.voronoiEdges.length) {
    const N = Math.min(256, foam.voronoiEdges.length);
    for (let i=0;i<N;i++) {
      const [a,b] = foam.voronoiEdges[i];
      keyAcc = ((keyAcc * 1315423911) ^ (a*73856093 ^ b*19349663)) >>> 0;
    }
  }
  // simple mix
  let h = 2166136261 >>> 0;
  function mix(x){ h ^= x>>>0; h = (h * 16777619) >>> 0; }
  mix(periodic); mix(np); mix(nt); mix(ve); mix(keyAcc);
  return h >>> 0;
}


