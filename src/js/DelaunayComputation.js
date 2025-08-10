/**
 * DelaunayComputation.js
 * 
 * A high-level JavaScript class that encapsulates the complexity of WASM interaction
 * and provides a clean API for Delaunay triangulation and Voronoi diagram computation.
 */

export class DelaunayComputation {
    constructor(points, isPeriodic = true, voronoiMethod = 'barycenter') {
        // Convert points to flat array if needed
        if (Array.isArray(points) && Array.isArray(points[0])) {
            // Points provided as [[x,y,z], [x,y,z], ...]
            this.pointsArray = points;
            this.points = new Float64Array(points.flat());
        } else if (points instanceof Float64Array || points instanceof Float32Array) {
            // Points provided as flat typed array
            this.points = new Float64Array(points);
            this.pointsArray = [];
            for (let i = 0; i < this.points.length; i += 3) {
                this.pointsArray.push([
                    this.points[i],
                    this.points[i + 1],
                    this.points[i + 2]
                ]);
            }
        } else {
            // Points provided as flat array
            this.points = new Float64Array(points);
            this.pointsArray = [];
            for (let i = 0; i < this.points.length; i += 3) {
                this.pointsArray.push([
                    this.points[i],
                    this.points[i + 1],
                    this.points[i + 2]
                ]);
            }
        }
        
        this.isPeriodic = isPeriodic;
        // Voronoi construction method: 'barycenter' (default) or 'circumcenter'
        // Using a string keeps the public API simple and avoids breaking changes
        this.voronoiMethod = voronoiMethod === 'circumcenter' ? 'circumcenter' : 'barycenter';
        this.numPoints = this.pointsArray.length;
        
        // Results will be stored here
        this.tetrahedra = [];
        this.voronoiEdges = [];
        this.voronoiCells = [];
        this.barycenters = [];
    }

    /**
     * Main method to run the computation
     * @param {Object} wasmModule - The loaded WASM module
     * @returns {DelaunayComputation} - Returns this for chaining
     */
    async compute(wasmModule) {
        if (!wasmModule) {
            throw new Error('WASM module not provided');
        }
        
        console.log(`Computing Delaunay triangulation for ${this.numPoints} points (${this.isPeriodic ? 'periodic' : 'non-periodic'})...`);
        
        // Debug: Log the first few points
        console.log('First 3 points:', this.pointsArray.slice(0, 3));
        
        try {
            // Call the WASM compute_delaunay function
            console.log('Calling WASM with:', {
                pointsLength: this.points.length,
                numPoints: this.numPoints,
                isPeriodic: this.isPeriodic
            });
            
            const rawResult = wasmModule.compute_delaunay(this.points, this.numPoints, this.isPeriodic);
            
            console.log('WASM returned:', rawResult ? `${rawResult.length} tetrahedra` : 'null/undefined');
            
            if (rawResult && rawResult.length > 0) {
                // Filter and convert the raw results
                this.tetrahedra = this._filterTetrahedra(rawResult);
                console.log(`Computed ${this.tetrahedra.length} valid tetrahedra (filtered from ${rawResult.length})`);
                
                // Compute Voronoi diagram from Delaunay using selected method
                if (this.voronoiMethod === 'circumcenter') {
                    this._computeVoronoiCircumcentric();
                } else {
                    this._computeVoronoiBarycentric();
                }
            } else {
                console.warn('No tetrahedra generated');
                this.tetrahedra = [];
                this.voronoiEdges = [];
            }
        } catch (error) {
            console.error('Error in Delaunay computation:', error);
            throw error;
        }
        
        return this; // Allow chaining
    }

    /**
     * Filter out tetrahedra with invalid vertex indices
     * @private
     */
    _filterTetrahedra(rawResult) {
        const filtered = [];
        let invalidCount = 0;
        
        for (const tet of rawResult) {
            // Check if all vertex indices are valid (non-negative and within bounds)
            const v0 = tet[0];
            const v1 = tet[1];
            const v2 = tet[2];
            const v3 = tet[3];
            
            if (v0 >= 0 && v0 < this.numPoints &&
                v1 >= 0 && v1 < this.numPoints &&
                v2 >= 0 && v2 < this.numPoints &&
                v3 >= 0 && v3 < this.numPoints) {
                // Convert to nested array format
                filtered.push([v0, v1, v2, v3]);
            } else {
                invalidCount++;
            }
        }
        
        if (invalidCount > 0) {
            console.log(`Filtered out ${invalidCount} tetrahedra with invalid vertex indices`);
        }
        
        return filtered;
    }

    /**
     * Compute Voronoi diagram using tetrahedra barycenters
     * @private
     */
    _computeVoronoiBarycentric() {
        if (this.tetrahedra.length === 0) return;

        console.log("Computing Voronoi diagram using barycenters...");

        // 1. Calculate the barycenter for each valid tetrahedron
        this.barycenters = [];
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetraIndices = this.tetrahedra[i];
            const p0 = this.pointsArray[tetraIndices[0]];
            const p1 = this.pointsArray[tetraIndices[1]];
            const p2 = this.pointsArray[tetraIndices[2]];
            const p3 = this.pointsArray[tetraIndices[3]];

            // For periodic mode, we need to handle wrap-around when computing barycenters
            if (this.isPeriodic) {
                // Use the first point as reference
                const ref = p0;
                
                // Adjust other points to be in the same periodic image
                const adjustPoint = (p) => {
                    const adjusted = [...p];
                    for (let dim = 0; dim < 3; dim++) {
                        const diff = p[dim] - ref[dim];
                        if (diff > 0.5) adjusted[dim] -= 1.0;
                        else if (diff < -0.5) adjusted[dim] += 1.0;
                    }
                    return adjusted;
                };
                
                const p1adj = adjustPoint(p1);
                const p2adj = adjustPoint(p2);
                const p3adj = adjustPoint(p3);
                
                let centerX = (ref[0] + p1adj[0] + p2adj[0] + p3adj[0]) / 4;
                let centerY = (ref[1] + p1adj[1] + p2adj[1] + p3adj[1]) / 4;
                let centerZ = (ref[2] + p1adj[2] + p2adj[2] + p3adj[2]) / 4;
                
                // Wrap the center back into [0,1]
                while (centerX < 0) centerX += 1.0;
                while (centerX >= 1) centerX -= 1.0;
                while (centerY < 0) centerY += 1.0;
                while (centerY >= 1) centerY -= 1.0;
                while (centerZ < 0) centerZ += 1.0;
                while (centerZ >= 1) centerZ -= 1.0;
                
                this.barycenters.push([centerX, centerY, centerZ]);
            } else {
                // Non-periodic case - simple average
                const centerX = (p0[0] + p1[0] + p2[0] + p3[0]) / 4;
                const centerY = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
                const centerZ = (p0[2] + p1[2] + p2[2] + p3[2]) / 4;
                this.barycenters.push([centerX, centerY, centerZ]);
            }
        }

        // Expose as barycenters for downstream visualization (reuse existing UI)
        this.barycenters = circumcenters;

        // 2. Build face-to-tetra adjacency map
        const faceToTetraMap = new Map();
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            // All 4 faces of a tetrahedron
            const faces = [
                [tetra[0], tetra[1], tetra[2]],
                [tetra[0], tetra[1], tetra[3]],
                [tetra[0], tetra[2], tetra[3]],
                [tetra[1], tetra[2], tetra[3]]
            ];
            
            faces.forEach(face => {
                // Create a canonical key for the face
                const key = face.slice().sort((a, b) => a - b).join('-');
                if (!faceToTetraMap.has(key)) {
                    faceToTetraMap.set(key, []);
                }
                faceToTetraMap.get(key).push(i);
            });
        }
        
        // 3. Create Voronoi edges by connecting barycenters of adjacent tetrahedra
        this.voronoiEdges = [];
        const edgeSet = new Set(); // To avoid duplicates
        
        for (const [faceKey, tetraIndices] of faceToTetraMap.entries()) {
            if (tetraIndices.length === 2) {
                // This face is shared by exactly 2 tetrahedra
                const idx1 = tetraIndices[0];
                const idx2 = tetraIndices[1];
                
                // Create edge key to avoid duplicates
                const edgeKey = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    const center1 = this.barycenters[idx1];
                    const center2 = this.barycenters[idx2];
                    this.voronoiEdges.push({
                        start: center1,
                        end: center2,
                        tetraIndices: [idx1, idx2],
                        isPeriodic: this._isPeriodicEdge(center1, center2)
                    });
                }
            }
        }
        
        console.log(`Computed ${this.voronoiEdges.length} Voronoi edges.`);
    }

    /**
     * Compute Voronoi diagram using tetrahedra circumcenters
     * - Robustly computes circumcenters with a fallback to centroid when nearly singular
     * - Handles periodic wrap by adjusting vertices to the same image before computing
     * @private
     */
    _computeVoronoiCircumcentric() {
        if (this.tetrahedra.length === 0) return;

        console.log("Computing Voronoi diagram using circumcenters...");

        // 1. Compute circumcenter for each tetrahedron
        const circumcenters = [];
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            const p0 = this.pointsArray[tetra[0]];
            const p1 = this.pointsArray[tetra[1]];
            const p2 = this.pointsArray[tetra[2]];
            const p3 = this.pointsArray[tetra[3]];

            let c;
            if (this.isPeriodic) {
                // Adjust to the same periodic image using p0 as reference
                const ref = p0;
                const adjustPoint = (p) => {
                    const adjusted = [...p];
                    for (let dim = 0; dim < 3; dim++) {
                        const diff = p[dim] - ref[dim];
                        if (diff > 0.5) adjusted[dim] -= 1.0;
                        else if (diff < -0.5) adjusted[dim] += 1.0;
                    }
                    return adjusted;
                };
                const a = [...p0];
                const b = adjustPoint(p1);
                const c2 = adjustPoint(p2);
                const d = adjustPoint(p3);

                c = this._circumcenterOfTetrahedron(a, b, c2, d);

                // Wrap back into [0,1)
                if (c) {
                    for (let dim = 0; dim < 3; dim++) {
                        while (c[dim] < 0) c[dim] += 1.0;
                        while (c[dim] >= 1) c[dim] -= 1.0;
                    }
                }
            } else {
                c = this._circumcenterOfTetrahedron(p0, p1, p2, p3);
            }

            // Fallback to centroid if computation failed or was ill-conditioned
            if (!c) {
                const centroid = [
                    (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
                    (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
                    (p0[2] + p1[2] + p2[2] + p3[2]) / 4,
                ];
                c = centroid;
            }

            circumcenters.push(c);
        }

        // 2. Build face-to-tetra adjacency map
        const faceToTetraMap = new Map();
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            const faces = [
                [tetra[0], tetra[1], tetra[2]],
                [tetra[0], tetra[1], tetra[3]],
                [tetra[0], tetra[2], tetra[3]],
                [tetra[1], tetra[2], tetra[3]],
            ];
            faces.forEach((face) => {
                const key = face.slice().sort((a, b) => a - b).join('-');
                if (!faceToTetraMap.has(key)) faceToTetraMap.set(key, []);
                faceToTetraMap.get(key).push(i);
            });
        }

        // 3. Connect circumcenters of adjacent tetrahedra
        this.voronoiEdges = [];
        const edgeSet = new Set();
        for (const [_, tets] of faceToTetraMap.entries()) {
            if (tets.length === 2) {
                const i1 = tets[0];
                const i2 = tets[1];
                const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
                if (edgeSet.has(key)) continue;
                edgeSet.add(key);

                const c1 = circumcenters[i1];
                const c2 = circumcenters[i2];
                if (!c1 || !c2) continue;

                this.voronoiEdges.push({
                    start: c1,
                    end: c2,
                    tetraIndices: [i1, i2],
                    isPeriodic: this._isPeriodicEdge(c1, c2),
                });
            }
        }

        console.log(`Computed ${this.voronoiEdges.length} Voronoi edges (circumcenter method).`);
    }

    /**
     * Compute the circumcenter of a tetrahedron defined by 4 points a,b,c,d
     * Returns null if the matrix is near-singular (degenerate tetrahedron)
     * Inspired by the robust formulation used in VoroX (circumcenter) and
     * computed by solving A x = b with rows (b-a), (c-a), (d-a) and b = 0.5*(|p|^2 - |a|^2)
     * @private
     */
    _circumcenterOfTetrahedron(a, b, c, d) {
        const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
        const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

        const ba = sub(b, a);
        const ca = sub(c, a);
        const da = sub(d, a);

        // Build 3x3 matrix A with rows ba, ca, da
        const A = [
            [ba[0], ba[1], ba[2]],
            [ca[0], ca[1], ca[2]],
            [da[0], da[1], da[2]],
        ];
        // b vector: 0.5*(|p|^2 - |a|^2)
        const a2 = dot(a, a);
        const rhs = [0.5 * (dot(b, b) - a2), 0.5 * (dot(c, c) - a2), 0.5 * (dot(d, d) - a2)];

        // Solve A x = rhs
        const x = this._solve3x3(A, rhs);
        if (!x) return null;
        return [x[0], x[1], x[2]];
    }

    /**
     * Solve a 3x3 linear system using Cramer's rule; return null if near-singular
     * @private
     */
    _solve3x3(A, b) {
        const det3 = (M) =>
            M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
            M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
            M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);

        const detA = det3(A);
        if (!isFinite(detA) || Math.abs(detA) < 1e-12) return null;

        const Mx = [
            [b[0], A[0][1], A[0][2]],
            [b[1], A[1][1], A[1][2]],
            [b[2], A[2][1], A[2][2]],
        ];
        const My = [
            [A[0][0], b[0], A[0][2]],
            [A[1][0], b[1], A[1][2]],
            [A[2][0], b[2], A[2][2]],
        ];
        const Mz = [
            [A[0][0], A[0][1], b[0]],
            [A[1][0], A[1][1], b[1]],
            [A[2][0], A[2][1], b[2]],
        ];

        const x = det3(Mx) / detA;
        const y = det3(My) / detA;
        const z = det3(Mz) / detA;
        if (![x, y, z].every((v) => isFinite(v))) return null;
        return [x, y, z];
    }

    /**
     * Check if an edge crosses periodic boundaries
     * @private
     */
    _isPeriodicEdge(p1, p2) {
        if (!this.isPeriodic) return false;
        
        const dx = Math.abs(p1[0] - p2[0]);
        const dy = Math.abs(p1[1] - p2[1]);
        const dz = Math.abs(p1[2] - p2[2]);
        
        // If any dimension has a distance > 0.5, it crosses the periodic boundary
        return dx > 0.5 || dy > 0.5 || dz > 0.5;
    }

    /**
     * Get the minimum image distance between two points in periodic space
     */
    getPeriodicDistance(p1, p2) {
        if (!this.isPeriodic) {
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const dz = p2[2] - p1[2];
            return Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
        
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let dz = p2[2] - p1[2];
        
        // Apply periodic boundary conditions
        if (dx > 0.5) dx -= 1.0;
        else if (dx < -0.5) dx += 1.0;
        
        if (dy > 0.5) dy -= 1.0;
        else if (dy < -0.5) dy += 1.0;
        
        if (dz > 0.5) dz -= 1.0;
        else if (dz < -0.5) dz += 1.0;
        
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    /**
     * Get statistics about the computation
     */
    getStats() {
        return {
            numPoints: this.numPoints,
            numTetrahedra: this.tetrahedra.length,
            numVoronoiEdges: this.voronoiEdges.length,
            isPeriodic: this.isPeriodic
        };
    }
} 