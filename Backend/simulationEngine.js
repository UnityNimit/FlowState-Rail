const initialLayout = require('./data/ghaziabad_layout');

class SimulationEngine {
    constructor() {
        // IMPORTANT: Deep clone the initial layout to prevent modifying the original object.
        // This ensures the simulation can be reset cleanly.
        this.state = JSON.parse(JSON.stringify(initialLayout));
        this.activeTrains = [];
        this.TRAIN_SPEED = 0.25; // Percentage of track segment covered per tick
        console.log("Simulation Engine Initialized.");
    }

    // Returns the entire current state of the network and trains
    getState() {
        return this.state;
    }

    // The main update loop, called at each interval ("tick")
    update() {
        // 1. Try to spawn a new train if conditions are met
        this.spawnTrain();

        // 2. Update the position of all active trains
        this.updateTrainPositions();
    }
    
    spawnTrain() {
        // Only spawn if there are fewer than 2 active trains and there are free routes
        if (this.activeTrains.length >= 2) return;

        const availableTrain = this.state.trains.find(t => t.state === 'STOPPED');
        const availableRoute = this.state.network.routes.find(r => r.state === 'FREE');

        if (availableTrain && availableRoute) {
            console.log(`Spawning train ${availableTrain.id} on route ${availableRoute.id}`);

            // Set route state to LOCKED
            availableRoute.state = 'LOCKED';

            // Set train state
            availableTrain.state = 'MOVING';
            availableTrain.routeId = availableRoute.id;
            
            // Put train on the first segment of the route
            const firstSegmentId = availableRoute.trackSegments[0];
            availableTrain.currentSegmentId = firstSegmentId;
            availableTrain.positionOnSegment = 0;

            // Mark the first segment as occupied
            const firstSegment = this.state.network.trackSegments.find(s => s.id === firstSegmentId);
            if(firstSegment) firstSegment.isOccupied = true;
            
            // Activate the train in our simulation
            this.activeTrains.push(availableTrain);
        }
    }

    updateTrainPositions() {
        if (this.activeTrains.length === 0) return;

        this.activeTrains.forEach(train => {
            if (train.state !== 'MOVING') return;

            // Move the train along its current segment
            train.positionOnSegment += this.TRAIN_SPEED;

            // Check if the train has reached the end of the segment
            if (train.positionOnSegment >= 1.0) {
                const currentRoute = this.state.network.routes.find(r => r.id === train.routeId);
                const currentSegmentIndex = currentRoute.trackSegments.indexOf(train.currentSegmentId);

                // Mark the old segment as free
                const oldSegment = this.state.network.trackSegments.find(s => s.id === train.currentSegmentId);
                if (oldSegment) oldSegment.isOccupied = false;

                // Check if there is a next segment in the route
                if (currentSegmentIndex < currentRoute.trackSegments.length - 1) {
                    const nextSegmentId = currentRoute.trackSegments[currentSegmentIndex + 1];
                    
                    // Move to the next segment
                    train.currentSegmentId = nextSegmentId;
                    train.positionOnSegment = 0; // Reset position

                    // Mark the new segment as occupied
                    const newSegment = this.state.network.trackSegments.find(s => s.id === nextSegmentId);
                    if (newSegment) newSegment.isOccupied = true;

                } else {
                    // Train has reached the end of its route
                    console.log(`Train ${train.id} has completed its route.`);
                    this.despawnTrain(train);
                }
            }
        });
    }

    despawnTrain(train) {
        // Free up the route
        const route = this.state.network.routes.find(r => r.id === train.routeId);
        if (route) route.state = 'FREE';

        // Reset train state
        train.state = 'STOPPED';
        train.routeId = null;
        train.currentSegmentId = null;
        train.positionOnSegment = 0;
        
        // Remove from active list
        this.activeTrains = this.activeTrains.filter(t => t.id !== train.id);
    }
}

module.exports = SimulationEngine;