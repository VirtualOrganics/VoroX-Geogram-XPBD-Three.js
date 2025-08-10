// TypeScript wrapper for Regular Triangulation / Power Diagram (Phase 1 scaffold)
// This wires to the Emscripten binding compute_regular_triangulation.

export type WeightedSite = { x:number; y:number; z:number; w2:number };
export type PowerCellFace = { verts: Uint32Array; siteA:number; siteB:number; area:number };
export type PowerCell = { siteId:number; verts: Uint32Array; faces: PowerCellFace[]; volume:number };

export type RTResult = {
  powerVerts: Float64Array;
  cells: PowerCell[];
  delEdges: Uint32Array;
  delEdgeDihedral?: Float64Array;
};

export async function computeRegularTriangulation(
  Module: any,
  sites: WeightedSite[],
  periodicBox: [number, number, number] = [1,1,1],
  minImage = true
): Promise<RTResult> {
  if (!Module || typeof Module.compute_regular_triangulation !== 'function') {
    throw new Error('WASM module missing compute_regular_triangulation');
  }
  // Call into WASM; binding returns a JS object with typed arrays
  const res = Module.compute_regular_triangulation(sites, periodicBox, minImage);
  // Structural checks; keep it minimal
  return {
    powerVerts: res.powerVerts ?? new Float64Array(0),
    cells: (res.cells ?? []).map((c: any) => ({
      siteId: c.siteId >>> 0,
      verts: c.verts instanceof Uint32Array ? c.verts : new Uint32Array(c.verts ?? []),
      faces: (c.faces ?? []).map((f: any) => ({
        verts: f.verts instanceof Uint32Array ? f.verts : new Uint32Array(f.verts ?? []),
        siteA: f.siteA >>> 0,
        siteB: f.siteB >>> 0,
        area: Number(f.area ?? 0)
      })),
      volume: Number(c.volume ?? 0)
    })),
    delEdges: res.delEdges instanceof Uint32Array ? res.delEdges : new Uint32Array(res.delEdges ?? []),
    delEdgeDihedral: res.delEdgeDihedral instanceof Float64Array ? res.delEdgeDihedral : (res.delEdgeDihedral ? new Float64Array(res.delEdgeDihedral) : undefined)
  } as RTResult;
}


