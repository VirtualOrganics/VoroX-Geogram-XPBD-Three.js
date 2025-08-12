# Control Panel Guide

## Edge PageRank System (NEW - Your Request)
- **Edge PageRank**: Enable the new edge-based PageRank system
- **Verlet Integration**: Use stable Verlet physics (recommended)
- **Search Depth**: PageRank iterations (15+ recommended for differentiation)
- **Threshold**: Score cutoff for contractive/expansive forces
- **Contractive/Expansive**: Apply forces based on edge scores
- **Damping**: Velocity damping for Verlet (0.99 = stable)

## Edge Visualization (NEW)
- **Color Edges by Score**: Apply red→yellow→green gradient based on PageRank
- **Show Edge Stats**: Display score statistics in status bar
- **Compute Edge Scores**: Manual button to compute scores

## Flow Dynamics - Core Physics
- **dt**: Time step for physics simulation
- **Energy**: Force strength in the system
- **Scale**: Overall system scale factor
- **Edge Scale**: Apply edge-based forces (original system)
- **Equilibration**: Seek equilibrium state

## Legacy Controls (Original VoroX System)

These controls are from the original VoroX implementation and work with the tetrahedra-based system:

### Why They're Still Here:
They provide the original VoroX functionality that can work alongside or independently of the new edge PageRank system.

### What They Do:

**FPS Limit** (30)
- Limits animation frame rate
- Useful for performance control

**Decay** (0.95)  
- Energy decay factor for original dynamics
- Controls how quickly motion settles

**Max Segs** (2000)
- Maximum VoroX flow segments to display
- Performance limit for flow visualization

**Flow Links** (checkbox)
- Shows connections between tetrahedra in original system
- Part of the tetrahedra-based flow visualization

**Ghost Cells** (checkbox)
- Shows periodic boundary ghost cells
- Helps visualize periodic boundaries

**Color Flow by Score** (checkbox)
- Colors the TETRAHEDRA-based flow by score
- This is DIFFERENT from "Color Edges by Score" which colors VORONOI EDGES

### The Two Systems:

1. **Original VoroX**: Tetrahedra-based flow system
   - Uses tetrahedra as nodes
   - PageRank on tetrahedra
   - "Color Flow by Score" for this system

2. **New Edge System**: Your requested edge-based system  
   - Uses Voronoi edges as nodes
   - PageRank on edges with obtuse angle connections
   - "Color Edges by Score" for this system

Both can run simultaneously or independently!

## Display Controls

**Voronoi Diagram → Edges**
- Must be checked to see Voronoi edges
- Without this, edge coloring won't be visible

## Quick Start for Edge System:

1. Enable "Voronoi Diagram → Edges" ✓
2. Set Search Depth to 15+
3. Click "Compute Edge Scores"
4. Enable "Color Edges by Score" ✓
5. Enable "Edge PageRank" ✓ for physics
6. Enable "Contractive" or "Expansive" for deformation
