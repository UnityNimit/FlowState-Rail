const initialLayout = require('./data/ghaziabad_layout');

class SimulationEngine {
    constructor() {
        this.state = JSON.parse(JSON.stringify(initialLayout));
        this.TRAIN_SPEED_FACTOR = 0.1; // Adjust for simulation speed
        console.log("Dynamic 'Hold and Release' Engine Initialized.");
    }

    getState() { return this.state; }

    // The main simulation loop, now smarter
    update() {
        this.checkAiHolds(); // Check for releases BEFORE moving trains
        this.updateTrainPositions();
    }

    updateTrainPositions() {
        const trainsToUpdate = this.state.trains.filter(t => t.state === 'MOVING' || t.state === 'WAITING_SIGNAL');
        
        trainsToUpdate.forEach(train => {
            if (!train.routeId) return;
            const currentRoute = this.state.network.routes.find(r => r.id === train.routeId);
            if (!currentRoute) return;

            const nextSignal = this.findNextSignalForTrain(train, currentRoute);

            if (train.state === 'WAITING_SIGNAL') {
                if (nextSignal && nextSignal.state === 'GREEN') {
                    console.log(`Train ${train.id} is proceeding as signal ${nextSignal.id} is now GREEN.`);
                    train.state = 'MOVING';
                } else {
                    return; // Continue waiting
                }
            }
            
            if (train.state === 'MOVING') {
                if (nextSignal && nextSignal.state === 'RED' && train.positionOnSegment >= 0.98) {
                    train.state = 'WAITING_SIGNAL';
                    return; 
                }
                
                train.positionOnSegment += this.TRAIN_SPEED_FACTOR;
                if (train.positionOnSegment >= 1.0) {
                    this.advanceTrainToNextSegment(train, currentRoute);
                }
            }
        });
    }

    checkAiHolds() {
        const heldTrains = this.state.trains.filter(t => t.state === 'WAITING_AI_HOLD');
        if (heldTrains.length === 0) return;

        heldTrains.forEach(heldTrain => {
            const condition = heldTrain.releaseCondition;
            if (!condition || !condition.checkTrainId || !condition.clearedSegmentId) return;

            const trainToCheck = this.state.trains.find(t => t.id === condition.checkTrainId);
            
            // Condition is met if the train to check has moved past the specified segment
            if (trainToCheck && trainToCheck.currentSegmentId !== condition.clearedSegmentId) {
                console.log(`RELEASE CONDITION MET: ${trainToCheck.id} has cleared ${condition.clearedSegmentId}. Releasing ${heldTrain.id}.`);
                
                this.setRouteForTrain(heldTrain, heldTrain.routeId);
                heldTrain.releaseCondition = null;
            }
        });
    }

    applyAiPlan(plan) {
        console.log("Applying new AI Plan to simulation state...");
        this.clearAllRoutes();

        plan.forEach(rec => {
            const train = this.state.trains.find(t => t.id === rec.trainId);
            if (!train) return;

            if (rec.action === 'PROCEED VIA') {
                this.setRouteForTrain(train, rec.details);
            } 
            else if (rec.action === 'HOLD AT SIGNAL') {
                console.log(`ENGINE: Setting train ${train.id} to HOLD state with release condition.`);
                // We assign the future routeId here so it knows what to do when released
                train.routeId = plan.find(p => p.trainId === rec.releaseCondition.checkTrainId)?.details;
                train.state = 'WAITING_AI_HOLD';
                train.releaseCondition = rec.releaseCondition;
            }
        });
    }

    clearAllRoutes() {
        this.state.network.routes.forEach(route => {
            if (route.isLockedByTrainId) this.unlockRoute(route);
        });
        this.state.trains.forEach(train => {
            if (train.state !== 'STOPPED' && train.state !== 'MOVING') {
                train.routeId = null;
            }
        });
    }

    setRouteForTrain(train, routeId) {
        const route = this.state.network.routes.find(r => r.id === routeId);
        if (!train || !route || route.isLockedByTrainId) return false;

        console.log(`ENGINE: Setting route ${routeId} for train ${train.id}`);
        route.isLockedByTrainId = train.id;
        route.pointSettings.forEach(ps => {
            const point = this.state.network.nodes.find(n => n.id === ps.pointId);
            if (point) {
                point.state = ps.requiredState;
                point.isLocked = true;
            }
        });

        train.routeId = route.id;
        if (train.state === 'STOPPED' || !train.currentSegmentId) {
             const firstSegmentId = route.trackSegments[0];
             train.currentSegmentId = firstSegmentId;
             train.positionOnSegment = 0;
             const firstSegment = this.state.network.trackSegments.find(s => s.id === firstSegmentId);
             if (firstSegment) firstSegment.isOccupied = true;
        }
        
        train.state = 'WAITING_SIGNAL'; 
        const entrySignal = this.state.network.nodes.find(n => n.id === route.entrySignal);
        if (entrySignal) entrySignal.state = 'GREEN';

        return true;
    }

    handleSignalClick(signalId) {
        const signal = this.state.network.nodes.find(n => n.id === signalId && n.type === 'SIGNAL');
        if (!signal) return;
        signal.state = signal.state === 'RED' ? 'GREEN' : 'RED';
        signal.isManuallyOverridden = true;
        console.log(`Controller manually set signal ${signalId} to ${signal.state}`);
    }

    // ==================================================================
    // --- MISSING HELPER FUNCTIONS (NOW INCLUDED) ---
    // ==================================================================
    
    advanceTrainToNextSegment(train, route) {
        const currentSegmentIndex = route.trackSegments.indexOf(train.currentSegmentId);
        const oldSegment = this.state.network.trackSegments.find(s => s.id === train.currentSegmentId);
        if (oldSegment) oldSegment.isOccupied = false;

        if (currentSegmentIndex < route.trackSegments.length - 1) {
            const nextSegmentId = route.trackSegments[currentSegmentIndex + 1];
            train.currentSegmentId = nextSegmentId;
            train.positionOnSegment = 0;
            const newSegment = this.state.network.trackSegments.find(s => s.id === nextSegmentId);
            if (newSegment) newSegment.isOccupied = true;
        } else {
            this.despawnTrain(train);
        }
    }

    despawnTrain(train) {
        console.log(`Train ${train.id} has completed its route.`);
        const route = this.state.network.routes.find(r => r.id === train.routeId);
        if (route) this.unlockRoute(route);
        train.state = 'STOPPED';
        train.routeId = null;
        train.currentSegmentId = null;
        train.positionOnSegment = 0;
    }

    unlockRoute(route) {
        route.isLockedByTrainId = null;
        route.pointSettings.forEach(ps => {
            const point = this.state.network.nodes.find(n => n.id === ps.pointId);
            if (point) point.isLocked = false;
        });
        const entrySignal = this.state.network.nodes.find(n => n.id === route.entrySignal);
        if (entrySignal) entrySignal.state = 'RED';
        const exitSignal = this.state.network.nodes.find(n => n.id === route.exitSignal);
        if (exitSignal) exitSignal.state = 'RED';
    }

    findNextSignalForTrain(train, route) {
        const currentSegmentIndex = route.trackSegments.indexOf(train.currentSegmentId);
        for (let i = currentSegmentIndex; i < route.trackSegments.length; i++) {
            const segment = this.state.network.trackSegments.find(s => s.id === route.trackSegments[i]);
            // It's possible for a segment to not exist in edge cases, so we check
            if (segment) {
                const endNode = this.state.network.nodes.find(n => n.id === segment.endNodeId);
                if (endNode && endNode.type === 'SIGNAL') return endNode;
            }
        }
        return null;
    }
}

module.exports = SimulationEngine;