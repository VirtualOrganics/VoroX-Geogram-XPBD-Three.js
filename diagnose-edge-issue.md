# Edge Coloring Diagnosis

## The Issue
- Edge scores compute correctly (0.0 to 1.0 range)
- But edges display as uniform yellow in main app
- Debug pages show correct color distribution

## About the Graph Links (249 edges vs 259 links)

This is **correct behavior**:
- **249 Voronoi edges** = connections between tetrahedra centers
- **259 graph links** = connections between edges that meet at obtuse angles

These are different things:
- Edges are the **nodes** in the PageRank graph
- Links are the **connections** between those nodes
- An edge can have multiple links to other edges it meets

## Debugging Steps

### 1. Open the main app and check console:
1. Enable "Color Edges by Score" checkbox
2. Click "Compute Edge Scores" button
3. Check browser console for output

You should see:
- "Manual edge score computation..."
- "Computed XXX edge scores"
- Score range statistics

### 2. Check if scores are being applied:
After computing scores, the console should show:
- Sample edge keys and their scores
- Any "Edge not found in scores" warnings

### 3. Manual test:
In browser console, run:
```javascript
console.log('lastEdgeScores:', lastEdgeScores);
if (lastEdgeScores) {
    console.log('Size:', lastEdgeScores.size);
    console.log('First 5:', Array.from(lastEdgeScores.entries()).slice(0,5));
}
```

## Possible Causes

1. **Score keys don't match edge keys**
   - Edge keys might be formatted differently
   - Check if tet indices are being sorted correctly

2. **Scores cleared before rendering**
   - Something might reset lastEdgeScores
   - Check if updateScene() is called multiple times

3. **Color function issue**
   - edgeScoreToColor might not be working
   - Test with: `edgeScoreToColor(0.1)`, `edgeScoreToColor(0.9)`

## Quick Fix to Try

1. Click "Compute Edge Scores" button manually
2. Wait 1 second
3. Toggle "Voronoi Edges" off and on
4. Check if colors appear

The scores ARE computing correctly - the issue is in applying them to the visualization.
