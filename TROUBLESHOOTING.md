# Troubleshooting Edge Coloring

## Current Issue: Edges Display as Uniform Yellow

### Quick Debug Steps:

1. **Open main app**: http://localhost:8080/examples/basic/index.html
2. **Press F12** to open browser console
3. **Check "Edges"** checkbox in Voronoi Diagram section
4. **Click "Compute Edge Scores"** button
5. **Check console output** for:
   - "Manual edge score computation with depth=X..."
   - "Computed XXX edge scores"
   - Key matching debug info
6. **Enable "Color Edges by Score"** checkbox
7. **Look in console** for:
   - "Starting edge coloring with XXX scores available"
   - Individual edge debug lines showing score and HSL values
   - "Edge coloring complete: X colored, Y default"

### Test Pages:

#### 1. Key Matching Test
http://localhost:8080/debug-key-matching.html
- Tests if edge keys match between computation and visualization
- Shows exactly which keys are missing

#### 2. Edge Coloring Test
http://localhost:8080/test-edge-coloring.html
- Isolated test of the coloring system
- Shows color gradient and actual edge colors
- Uses irregular point distribution for better score variation

#### 3. System Verification
http://localhost:8080/verify-edge-system.html
- Comprehensive system test
- Shows graph statistics and color distribution

### Common Issues:

#### All edges same color (yellow)?
1. **Low Search Depth**: Increase to 15+ for better differentiation
2. **Regular mesh**: Uniform meshes produce similar scores
3. **Score variance too low**: Check console for score range

#### No edges visible?
1. **"Edges" checkbox not checked** in Voronoi Diagram section
2. **No Voronoi edges in foam**: Check foam.voronoiEdges.length

#### Console shows "0 colored, XXX default"?
1. **Key mismatch**: Edge keys don't match between score computation and visualization
2. Run debug-key-matching.html to diagnose

### Manual Console Debug:

```javascript
// Check if scores exist
console.log('Scores:', lastEdgeScores?.size || 0);

// Check score range
if (lastEdgeScores) {
    const values = Array.from(lastEdgeScores.values());
    console.log('Score range:', Math.min(...values), 'to', Math.max(...values));
}

// Force recompute with high depth
if (voroxInstance) {
    const foam = voroxInstance.getFoam();
    const { calculateEdgeScores } = await import('/src/js/vorox2/dynamics.js');
    const result = calculateEdgeScores(foam, 30, 0.85);
    lastEdgeScores = result.scores;
    updateScene();
}
```

## What Was Cleaned Up:

### Removed from UI (but kept hidden for compatibility):
- **Decay**: Old energy decay (not used in edge mode)
- **Max Segs**: Flow segment limit (for old tetrahedra flow)
- **Flow Links**: Old tetrahedra-based flow visualization
- **Color Flow by Score**: Colors tetrahedra, not edges

### Kept Visible:
- **FPS Limit**: Still useful for performance
- **Ghost Cells**: Helpful for periodic boundaries

## System Architecture:

### Two PageRank Systems:
1. **Old**: Tetrahedra as nodes (hidden controls)
2. **New**: Voronoi edges as nodes (your requested system)

### Edge Graph Structure:
- **Nodes**: Voronoi edges (connections between tetrahedra centers)
- **Links**: Edges that meet at obtuse angles (> 90°)
- **PageRank**: Iterative importance scoring on edge network

### Expected Behavior:
- With 249 edges, expect ~259 links (obtuse connections)
- Higher Search Depth = more score differentiation
- Irregular meshes = more color variation
- Regular meshes = similar scores (mostly yellow)
