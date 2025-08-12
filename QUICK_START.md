# 🌈 Quick Start - Edge Coloring

## Fastest Way to See Edge Coloring:

### Option 1: One-Click Demo
1. Open http://localhost:8080/examples/basic/index.html
2. Click the **🌈 Quick Color Demo** button
3. Watch the edges appear with red→yellow→green gradient!

### Option 2: Manual Setup
1. Set **Points** to **30** (not 150)
2. Click **Generate**
3. Check **"Edges"** in Voronoi Diagram section (now checked by default)
4. Check **"Color Edges by Score"** in Edge Visualization
5. Move **Search Depth** slider to see colors change!

## Why Search Depth Matters:

- **Low (5-10)**: Scores converge quickly, less differentiation
- **Medium (15-20)**: Good balance of variation
- **High (25-30)**: Maximum differentiation, best colors

## Why It Shows Yellow with Regular Meshes:

With 150 uniform points, all edges have similar connectivity, so PageRank scores are similar (~0.5), resulting in yellow (middle of the gradient).

**For better colors:**
- Use **fewer points** (20-50)
- Use **irregular distributions**
- Increase **Search Depth**

## What The Colors Mean:

- 🔴 **Red**: Low PageRank score (less important edges)
- 🟡 **Yellow**: Medium PageRank score
- 🟢 **Green**: High PageRank score (most important edges)

## Controls That Affect Coloring:

- **Search Depth**: How many PageRank iterations (more = better differentiation)
- **Points**: Fewer points = more variation in scores
- **Color Edges by Score**: Enable/disable coloring
- **Show Edge Stats**: Display score statistics

## Test Pages:

For debugging and testing:
- http://localhost:8080/simple-edge-test.html - Interactive 3D test
- http://localhost:8080/test-edge-coloring.html - Color gradient test
- http://localhost:8080/debug-key-matching.html - Edge key verification
- http://localhost:8080/verify-edge-system.html - Full system test

## Console Commands:

```javascript
// Check if scores exist
console.log('Scores:', lastEdgeScores?.size || 0);

// Force recompute with high depth
if (voroxInstance) {
    const foam = voroxInstance.getFoam();
    const { calculateEdgeScores } = await import('/src/js/vorox2/dynamics.js');
    const result = calculateEdgeScores(foam, 30, 0.85);
    lastEdgeScores = result.scores;
    updateScene();
}
```

## The System IS Working!

The Edge PageRank system is fully functional. Uniform yellow just means the mesh is regular. Use the **🌈 Quick Color Demo** button to see it in action with optimal settings!
