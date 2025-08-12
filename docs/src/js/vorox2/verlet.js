/**
 * Verlet Integration System
 * Provides stable physics integration using position-based dynamics
 * More stable than Euler integration for oscillatory systems
 */

import { wrap01 } from './core.js';

/**
 * Verlet integrator state
 * Stores current and previous positions for velocity inference
 */
export class VerletIntegrator {
    constructor(numPoints, isPeriodic = false) {
        this.numPoints = numPoints;
        this.isPeriodic = isPeriodic;
        this.positions = null;
        this.prevPositions = null;
        this.accelerations = Array.from({length: numPoints}, () => [0, 0, 0]);
        this.damping = 0.99; // Velocity damping factor
        this.initialized = false;
    }
    
    /**
     * Initialize with starting positions
     */
    initialize(positions) {
        this.positions = positions.map(p => [...p]); // Deep copy
        this.prevPositions = positions.map(p => [...p]); // Start with zero velocity
        this.initialized = true;
    }
    
    /**
     * Update positions if external changes occur
     */
    setPositions(positions) {
        // Keep velocity by maintaining difference
        if (this.initialized && this.positions) {
            const velocities = this.positions.map((p, i) => [
                p[0] - this.prevPositions[i][0],
                p[1] - this.prevPositions[i][1],
                p[2] - this.prevPositions[i][2]
            ]);
            
            this.positions = positions.map(p => [...p]);
            this.prevPositions = positions.map((p, i) => [
                p[0] - velocities[i][0],
                p[1] - velocities[i][1],
                p[2] - velocities[i][2]
            ]);
        } else {
            this.initialize(positions);
        }
    }
    
    /**
     * Compute accelerations from forces
     * F = ma, so a = F/m (assuming unit mass)
     */
    setForces(forces) {
        this.accelerations = forces.map(f => [...f]);
    }
    
    /**
     * Perform Verlet integration step
     * x(t+dt) = 2*x(t) - x(t-dt) + a(t)*dt²
     * 
     * @param {number} dt - Time step
     * @param {number} maxDelta - Maximum position change per step (for stability)
     * @returns {Array} New positions
     */
    integrate(dt, maxDelta = 0.02) {
        if (!this.initialized) {
            throw new Error('Verlet integrator not initialized');
        }
        
        const newPositions = [];
        const dtSquared = dt * dt;
        
        for (let i = 0; i < this.numPoints; i++) {
            const pos = this.positions[i];
            const prevPos = this.prevPositions[i];
            const acc = this.accelerations[i];
            
            // Verlet formula with damping
            let dx = this.damping * (pos[0] - prevPos[0]) + acc[0] * dtSquared;
            let dy = this.damping * (pos[1] - prevPos[1]) + acc[1] * dtSquared;
            let dz = this.damping * (pos[2] - prevPos[2]) + acc[2] * dtSquared;
            
            // Clamp maximum displacement for stability
            const deltaMag = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (deltaMag > maxDelta) {
                const scale = maxDelta / deltaMag;
                dx *= scale;
                dy *= scale;
                dz *= scale;
            }
            
            // New position
            let newX = pos[0] + dx;
            let newY = pos[1] + dy;
            let newZ = pos[2] + dz;
            
            // Apply periodic boundary conditions if needed
            if (this.isPeriodic) {
                newX = wrap01(newX);
                newY = wrap01(newY);
                newZ = wrap01(newZ);
            }
            
            newPositions.push([newX, newY, newZ]);
        }
        
        // Update state
        this.prevPositions = this.positions;
        this.positions = newPositions;
        
        return newPositions;
    }
    
    /**
     * Apply constraints (e.g., fixed points, distance constraints)
     * This is called after integration to satisfy constraints
     */
    applyConstraints(constraints = []) {
        // Example constraint types:
        // { type: 'fixed', pointIndex: i, position: [x,y,z] }
        // { type: 'distance', indices: [i,j], distance: d }
        
        for (const constraint of constraints) {
            if (constraint.type === 'fixed') {
                const idx = constraint.pointIndex;
                this.positions[idx] = [...constraint.position];
            } else if (constraint.type === 'distance') {
                // Simple distance constraint solver
                const [i, j] = constraint.indices;
                const targetDist = constraint.distance;
                
                const p1 = this.positions[i];
                const p2 = this.positions[j];
                
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                const dz = p2[2] - p1[2];
                
                const currentDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (currentDist < 1e-6) continue;
                
                const correction = (targetDist - currentDist) / currentDist;
                const offsetX = dx * correction * 0.5;
                const offsetY = dy * correction * 0.5;
                const offsetZ = dz * correction * 0.5;
                
                // Move points equally to satisfy constraint
                this.positions[i][0] -= offsetX;
                this.positions[i][1] -= offsetY;
                this.positions[i][2] -= offsetZ;
                
                this.positions[j][0] += offsetX;
                this.positions[j][1] += offsetY;
                this.positions[j][2] += offsetZ;
                
                // Reapply periodic boundaries if needed
                if (this.isPeriodic) {
                    this.positions[i] = this.positions[i].map(wrap01);
                    this.positions[j] = this.positions[j].map(wrap01);
                }
            }
        }
    }
    
    /**
     * Get current velocities (inferred from position differences)
     */
    getVelocities() {
        if (!this.initialized) return null;
        
        return this.positions.map((pos, i) => [
            pos[0] - this.prevPositions[i][0],
            pos[1] - this.prevPositions[i][1],
            pos[2] - this.prevPositions[i][2]
        ]);
    }
    
    /**
     * Set damping factor (0 = no damping, 1 = no velocity loss)
     */
    setDamping(damping) {
        this.damping = Math.max(0, Math.min(1, damping));
    }
    
    /**
     * Reset the integrator
     */
    reset() {
        this.positions = null;
        this.prevPositions = null;
        this.accelerations = Array.from({length: this.numPoints}, () => [0, 0, 0]);
        this.initialized = false;
    }
}
