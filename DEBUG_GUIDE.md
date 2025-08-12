# Debug Guide - Edge PageRank System

## Module Loading Issues

The error "window.PeriodicDelaunayModule is not a function" indicates the WASM module isn't loading properly.

### Test Module Loading First:
1. Open: http://localhost:8080/test-module.html
2. Click "Test Module" button
3. If it fails, click "Test Delayed (wait 1s)"

### If Module Won't Load:
- Check browser console for errors
- Make sure `/dist/periodic_delaunay.js` and `/dist/periodic_delaunay.wasm` exist
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Check if server is serving files correctly

## Debug Pages (in order of complexity):

### 1. Module Test (simplest)
http://localhost:8080/test-module.html
- Tests if WASM module loads at all
- Shows what's available in the module

### 2. Key Matching Test
http://localhost:8080/debug-key-matching.html
- Tests if edge keys match between computation and visualization
- Shows exactly which keys are missing

### 3. Edge Coloring Test
http://localhost:8080/test-edge-coloring.html
- Tests the color gradient system
- Shows actual edge scores and colors

### 4. Simple 3D Test
http://localhost:8080/simple-edge-test.html
- Interactive 3D visualization
- Click buttons in order: Generate → Compute → Toggle Coloring

### 5. Full System Test
http://localhost:8080/verify-edge-system.html
- Comprehensive test of all components
- Shows what's working and what's not

## Main Application

http://localhost:8080/examples/basic/index.html

### To See Edge Coloring:
1. **Enable "Voronoi Diagram → Edges"** checkbox
2. Click **"Compute Edge Scores"** button
3. Enable **"Color Edges by Score"** checkbox
4. Check console (F12) for debug output

### Console Commands for Manual Testing:

```javascript
// Check if module is loaded
console.log('Module available:', typeof window.PeriodicDelaunayModule);

// Check if VoroX instance exists
console.log('VoroX instance:', voroxInstance);

// Check if scores exist
console.log('Edge scores:', lastEdgeScores?.size || 'none');

// Force compute scores with high depth
if (voroxInstance) {
    (async () => {
        const { calculateEdgeScores } = await import('/src/js/vorox2/dynamics.js');
        const foam = voroxInstance.getFoam();
        const result = calculateEdgeScores(foam, 30, 0.85);
        lastEdgeScores = result.scores;
        console.log('Computed', lastEdgeScores.size, 'scores');
        updateScene();
    })();
}
```

## Common Issues & Solutions:

### "Module not a function"
- Module isn't loaded yet
- Wait a moment and try again
- Use test-module.html to diagnose

### "All edges yellow"
- Scores are too similar (regular mesh)
- Try fewer points (30-50)
- Increase Search Depth to 20+
- Use irregular point distribution

### "No edges visible"
- "Edges" checkbox not checked
- No Voronoi edges in foam
- Check foam.voronoiEdges.length in console

### "0 colored, XXX default"
- Edge key mismatch
- Run debug-key-matching.html
- Check if keys are formatted differently

## Architecture Reminder:

### Edge PageRank System:
- **Nodes**: Voronoi edges (connections between tetrahedra)
- **Links**: Edges meeting at obtuse angles (> 90°)
- **PageRank**: Iterative scoring on edge network
- **Coloring**: Red (low) → Yellow (mid) → Green (high)

### Expected Stats (typical):
- ~200-400 Voronoi edges (depends on point count)
- ~250-500 graph links (obtuse connections)
- Search Depth 15+ for good differentiation
- Score range 0.0-1.0 (wider = more color variation)
