# Edge Coloring Test Instructions

## Quick Test

1. Open http://localhost:8080/examples/basic/index.html
2. Press F12 to open browser console
3. Make sure **"Voronoi Edges"** checkbox is ON (in Display section)
4. Click **"Compute Edge Scores"** button (in Edge Visualization section)
5. Check console output - you should see:
   - "Manual edge score computation..."
   - "Computed XXX edge scores"
   - Score statistics

6. Enable **"Color Edges by Score"** checkbox
7. Check console for:
   - "Starting edge coloring with XXX scores available"
   - "Edge coloring complete: X colored, Y default"

## If edges remain yellow:

The console will tell you exactly what's wrong:
- **"0 colored, XXX default"** = Edge keys don't match
- **"XXX colored, 0 default"** = Coloring worked but colors are similar

## Manual Debug in Console

Run this in browser console:
```javascript
// Check if scores exist
console.log('Scores exist:', lastEdgeScores ? lastEdgeScores.size : 0);

// Check foam edges
const foam = voroxInstance.getFoam();
console.log('Foam edges:', foam.voronoiEdges.length);

// Check first edge key
if (foam.voronoiEdges.length > 0) {
    const edge = foam.voronoiEdges[0];
    const key = `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;
    console.log('First edge key:', key);
    console.log('Has score:', lastEdgeScores?.has(key));
}

// Show all score keys
if (lastEdgeScores) {
    console.log('Score keys:', Array.from(lastEdgeScores.keys()).slice(0, 5));
}
```

## About the 249 edges vs 259 links

This is **CORRECT**:
- 249 = Voronoi edges (connections between tetrahedra)
- 259 = Graph links (connections between edges at obtuse angles)

Think of it like a social network:
- 249 people (edges)
- 259 friendships (links between edges)

The PageRank runs on the edge network where edges are nodes and links are connections.
