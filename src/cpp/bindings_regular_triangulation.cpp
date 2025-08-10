#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "regular_triangulation.h"

using namespace emscripten;

// Convert C++ RTResult into a JS-friendly object with typed arrays
static val to_js_result(const RTResult& r) {
  // powerVerts Float64Array
  val powerVerts = val::global("Float64Array").new_(r.powerVerts.size());
  for (size_t i = 0; i < r.powerVerts.size(); ++i) powerVerts.set(i, r.powerVerts[i]);

  // delEdges Uint32Array
  val delEdges = val::global("Uint32Array").new_(r.delEdges.size());
  for (size_t i = 0; i < r.delEdges.size(); ++i) delEdges.set(i, r.delEdges[i]);

  // delEdgeDihedral Float64Array (optional)
  val delEdgeDihedral = val::undefined();
  if (!r.delEdgeDihedral.empty()) {
    delEdgeDihedral = val::global("Float64Array").new_(r.delEdgeDihedral.size());
    for (size_t i = 0; i < r.delEdgeDihedral.size(); ++i) delEdgeDihedral.set(i, r.delEdgeDihedral[i]);
  }

  // cells as array of objects
  val cells = val::array();
  for (size_t ci = 0; ci < r.cells.size(); ++ci) {
    const PowerCell& c = r.cells[ci];
    val verts = val::global("Uint32Array").new_(c.verts.size());
    for (size_t i = 0; i < c.verts.size(); ++i) verts.set(i, c.verts[i]);

    val faces = val::array();
    for (size_t fi = 0; fi < c.faces.size(); ++fi) {
      const PowerCellFace& f = c.faces[fi];
      val fverts = val::global("Uint32Array").new_(f.verts.size());
      for (size_t j = 0; j < f.verts.size(); ++j) fverts.set(j, f.verts[j]);
      val fobj = val::object();
      fobj.set("verts", fverts);
      fobj.set("siteA", f.siteA);
      fobj.set("siteB", f.siteB);
      fobj.set("area", f.area);
      faces.set(faces["length"].as<unsigned>(), fobj);
    }

    val cobj = val::object();
    cobj.set("siteId", c.siteId);
    cobj.set("verts", verts);
    cobj.set("faces", faces);
    cobj.set("volume", c.volume);
    cells.set(cells["length"].as<unsigned>(), cobj);
  }

  val out = val::object();
  out.set("powerVerts", powerVerts);
  out.set("cells", cells);
  out.set("delEdges", delEdges);
  if (!r.delEdgeDihedral.empty()) out.set("delEdgeDihedral", delEdgeDihedral);
  return out;
}

// JS entrypoint: accepts JS array of sites, periodic box, and minImage flag
static val compute_regular_triangulation_js(val jsSites, val jsPeriodicBox, bool minImage) {
  const unsigned n = jsSites["length"].as<unsigned>();
  std::vector<WeightedSite> sites;
  sites.reserve(n);
  for (unsigned i = 0; i < n; ++i) {
    val s = jsSites[i];
    WeightedSite ws{ s["x"].as<double>(), s["y"].as<double>(), s["z"].as<double>(), s["w2"].as<double>() };
    sites.push_back(ws);
  }
  double L[3] = {0.0, 0.0, 0.0};
  if (jsPeriodicBox.isArray() && jsPeriodicBox["length"].as<unsigned>() >= 3) {
    L[0] = jsPeriodicBox[0].as<double>();
    L[1] = jsPeriodicBox[1].as<double>();
    L[2] = jsPeriodicBox[2].as<double>();
  }
  RTResult r = compute_regular_triangulation(sites.data(), n, L, minImage);
  return to_js_result(r);
}

EMSCRIPTEN_BINDINGS(rt_bindings) {
  function("compute_regular_triangulation", &compute_regular_triangulation_js);
}


