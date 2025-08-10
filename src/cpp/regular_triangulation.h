#pragma once

#include <cstdint>
#include <vector>

// NOTE: This is a scaffold for Phase 1. It defines clean C++ types and a
// single entrypoint. The initial implementation will return empty results so we
// can wire up Emscripten bindings and JS wrappers end-to-end. We will then fill
// in the real Regular Triangulation / Power Diagram computation.

// site: position + weight^2 (power diagram convention)
struct WeightedSite {
  double x, y, z, w2;
};

struct PowerCellFace {
  // Indices into vertices (Voronoi/Power diagram vertex indices)
  std::vector<uint32_t> verts;
  // Adjacent Delaunay sites (2 for 2-cells across face)
  uint32_t siteA = 0, siteB = 0;
  double area = 0.0;
};

struct PowerCell {
  uint32_t siteId = 0;
  std::vector<uint32_t> verts;        // polygon vertices of the cell (convex)
  std::vector<PowerCellFace> faces;   // faces (with adjacency)
  double volume = 0.0;
};

struct RTResult {
  // Voronoi / power vertices in 3D (world coords, already periodic-folded)
  // flat array [x0,y0,z0, x1,y1,z1, ...]
  std::vector<double> powerVerts;
  std::vector<PowerCell> cells;
  // Delaunay edges and dihedral data for metrics
  // flat pairs [i0,j0, i1,j1, ...] site indices
  std::vector<uint32_t> delEdges;
  // Optional: per-edge incident tets count, dihedral angles (radians)
  std::vector<double> delEdgeDihedral; // same length as delEdges/2
};

extern "C" {
  // periodicBox: [Lx, Ly, Lz]; if non-periodic, pass zeros.
  // minImage: whether to use minimum-image convention in metric computations.
  RTResult compute_regular_triangulation(
    const WeightedSite* sites, uint32_t nSites,
    const double periodicBox[3],
    bool minImage
  );
}


