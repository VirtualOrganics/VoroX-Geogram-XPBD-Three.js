# Edge PageRank System - User Guide

## Overview
The Edge PageRank system implements the Voronoi edge-based control architecture you described, where:
- **Voronoi edges** are nodes in a connectivity graph
- Edges are linked if they meet at **obtuse angles** (>90°)
- **PageRank** computes importance scores for flow pathways
- Scores control **deformation** of dual Delaunay faces

## Quick Start

### To Enable Edge-Based PageRank:
1. Open http://localhost:8080/examples/basic/index.html
2. In **Edge PageRank System** section:
   - ✅ Enable **"Edge PageRank"**
   - ✅ Enable **"Color Edges by Score"** to visualize
   - Set **Search Depth** to 10 (more iterations = better scores)
   - Set **Threshold** to 0.5
   - Enable **Contractive** and/or **Expansive** modes
3. Click **Run** to see dynamics

### Visual Feedback:
- **Red edges** = Low PageRank score (less important)
- **Yellow edges** = Medium score
- **Green edges** = High PageRank score (most important pathways)

## Control Reference

### Core Physics Controls
| Control | Purpose | Recommended |
|---------|---------|-------------|
| **dt (Time Step)** | Physics integration step size | 0.02 |
| **Energy** | Overall force strength multiplier | 0.0005 |
| **Scale** | Target edge length for equilibration | 0.5 |
| **Edge Scale** | Apply forces to edges vs centers | ✅ On |
| **Equilibration** | Basic mesh equilibration forces | ✅ On |

### Edge PageRank System
| Control | Purpose | Recommended |
|---------|---------|-------------|
| **Edge PageRank** | Enable edge-based system (vs tetrahedra) | ✅ On for edge mode |
| **Search Depth** | PageRank iterations (accuracy) | 10-15 |
| **Threshold** | Score cutoff for contraction/expansion | 0.5 |
| **Contractive** | Shrink faces with score < threshold | As needed |
| **Expansive** | Expand faces with score > threshold | As needed |
| **Verlet Integration** | Use stable Verlet physics | ✅ On for stability |
| **Damping** | Velocity damping (0.8-1.0) | 0.99 |

### Visualization
| Control | Purpose |
|---------|---------|
| **Color Edges by Score** | Show PageRank scores as edge colors |
| **Show Edge Stats** | Display min/max/avg scores |

### Legacy Controls (Tetrahedra-based)
| Control | Purpose | Still Used? |
|---------|---------|-------------|
| **FPS Limit** | Animation framerate | ✅ Yes |
| **Decay** | Legacy parameter | ❌ Not in edge mode |
| **Max Segs** | Render limit for flow links | ✅ Yes |
| **Flow Links** | Show tetrahedra-based flow | ❌ Different system |
| **Color Flow by Score** | Color tetrahedra flow | ❌ Different from edges |

## Troubleshooting

### All edges show same color?
**Possible causes:**
1. **Edge PageRank not enabled** - Check the checkbox
2. **"Color Edges by Score" not enabled** - Must be checked
3. **Scores not computed** - Click "Run" or "Step" once
4. **Uniform mesh** - Very regular meshes may have similar scores
5. **Low Search Depth** - Try increasing to 15-20

**Debug steps:**
1. Open http://localhost:8080/debug-edge-colors.html
2. Click "Test Edge Scoring"
3. Check if scores show variation

### System not responding?
1. Disable **Edge PageRank** temporarily
2. Lower **Energy** to 0.0001
3. Reduce **Search Depth** to 5
4. Check browser console for errors

### Colors conflict?
The system has TWO separate coloring modes:
- **"Color Edges by Score"** - Colors Voronoi edges by PageRank (NEW)
- **"Color Flow by Score"** - Colors tetrahedra flow links (OLD)

These are independent and shouldn't conflict. Edge coloring only affects Voronoi edges.

## Architecture Details

### Data Flow:
1. **Delaunay mesh** → Tetrahedra centers become Voronoi vertices
2. **Voronoi edges** connect tetrahedra centers
3. **Edge graph** built from edges meeting at obtuse angles
4. **PageRank** computes importance scores
5. **Deformation** applied to Delaunay faces based on scores
6. **Integration** updates positions (Verlet or Euler)

### Score Interpretation:
- **High score** (green): Central to flow network, many obtuse connections
- **Low score** (red): Peripheral, few connections
- **Threshold**: Divides contractive vs expansive behavior

## Testing Tools

### Available Test Pages:
- `/test-edge-system.html` - Raw data inspection
- `/test-edge-visualization.html` - Interactive 3D test
- `/debug-edge-colors.html` - Color debugging

## Tips for Best Results

1. **Start simple**: Enable only Edge PageRank first, then add features
2. **Watch the colors**: They show which edges are important
3. **Adjust threshold**: Move it to see different contraction patterns  
4. **Use Verlet**: More stable than Euler for complex dynamics
5. **Increase Search Depth**: For more accurate PageRank scores

## Current Limitations

- Requires obtuse angles for connections (by design)
- Very uniform meshes may have similar scores everywhere
- Computational cost increases with Search Depth
- Edge coloring only visible when "Voronoi Edges" are shown

## Files Modified

- `/src/js/vorox2/edgeGraph.js` - Edge connectivity graph
- `/src/js/vorox2/verlet.js` - Verlet integrator
- `/src/js/vorox2/dynamics.js` - Enhanced with edge modes
- `/examples/basic/index.html` - UI and visualization
