// This file acts as our "single source of truth" for the network layout.
// In a real application, this would be fetched from a backend API.

const layoutData = {
  "stationName": "Ghaziabad Junction (GZB)",
  "description": "A detailed schematic model of the Ghaziabad railway station yard for a section controller simulation. Coordinates are logical for rendering, not geographical.",
  "network": {
    "nodes": [
      { "id": "S-H-UML", "type": "SIGNAL", "description": "Home Signal, UP Main Line", "position": { "x": 50, "y": 100 }, "state": "RED" },
      { "id": "S-H-DML", "type": "SIGNAL", "description": "Home Signal, DOWN Main Line", "position": { "x": 50, "y": 150 }, "state": "RED" },
      { "id": "S-H-UML2", "type": "SIGNAL", "description": "Home Signal, UP Main Line 2", "position": { "x": 50, "y": 200 }, "state": "RED" },
      { "id": "S-H-DML2", "type": "SIGNAL", "description": "Home Signal, DOWN Main Line 2", "position": { "x": 50, "y": 250 }, "state": "RED" },

      { "id": "P-1A", "type": "POINT_SWITCH", "description": "Crossover between UP Main Lines", "position": { "x": 150, "y": 100 }, "state": "NORMAL" },
      { "id": "P-1B", "type": "POINT_SWITCH", "description": "Crossover between DOWN Main Lines", "position": { "x": 150, "y": 150 }, "state": "NORMAL" },
      { "id": "P-2A", "type": "POINT_SWITCH", "description": "Entry to Platform 1/2 line", "position": { "x": 250, "y": 100 }, "state": "NORMAL" },
      { "id": "P-2B", "type": "POINT_SWITCH", "description": "Entry to Platform 3/4 line", "position": { "x": 250, "y": 150 }, "state": "NORMAL" },
      { "id": "P-2C", "type": "POINT_SWITCH", "description": "Entry to Platform 5/6 line", "position": { "x": 250, "y": 200 }, "state": "NORMAL" },
      { "id": "P-2D", "type": "POINT_SWITCH", "description": "Entry to DOWN through line", "position": { "x": 250, "y": 250 }, "state": "NORMAL" },
      
      { "id": "S-S1", "type": "SIGNAL", "description": "Starter, Platform 1", "position": { "x": 700, "y": 50 }, "state": "RED" },
      { "id": "S-S2", "type": "SIGNAL", "description": "Starter, Platform 2", "position": { "x": 700, "y": 90 }, "state": "RED" },
      { "id": "S-S3", "type": "SIGNAL", "description": "Starter, Platform 3", "position": { "x": 700, "y": 130 }, "state": "GREEN" },
      { "id": "S-S4", "type": "SIGNAL", "description": "Starter, Platform 4", "position": { "x": 700, "y": 170 }, "state": "RED" },
      { "id": "S-S5", "type": "SIGNAL", "description": "Starter, Platform 5", "position": { "x": 700, "y": 210 }, "state": "RED" },
      { "id": "S-S6", "type": "SIGNAL", "description": "Starter, Platform 6", "position": { "x": 700, "y": 250 }, "state": "RED" },

      { "id": "P-3A", "type": "POINT_SWITCH", "description": "Exit from Platform 1/2", "position": { "x": 800, "y": 70 }, "state": "NORMAL" },
      { "id": "P-3B", "type": "POINT_SWITCH", "description": "Exit from Platform 3/4", "position": { "x": 800, "y": 150 }, "state": "NORMAL" },
      { "id": "P-3C", "type": "POINT_SWITCH", "description": "Exit from Platform 5/6", "position": { "x": 800, "y": 230 }, "state": "NORMAL" },
      { "id": "P-4A", "type": "POINT_SWITCH", "description": "Merge to Tundla/Moradabad lines", "position": { "x": 900, "y": 90 }, "state": "NORMAL" },
      { "id": "P-4B", "type": "POINT_SWITCH", "description": "Merge to Meerut/Down lines", "position": { "x": 900, "y": 250 }, "state": "NORMAL" },

      { "id": "S-AS-MRD", "type": "SIGNAL", "description": "Advanced Starter, Moradabad Line", "position": { "x": 1000, "y": 50 }, "state": "RED" },
      { "id": "S-AS-TDL", "type": "SIGNAL", "description": "Advanced Starter, Tundla Line", "position": { "x": 1000, "y": 130 }, "state": "RED" },
      { "id": "S-AS-MRT", "type": "SIGNAL", "description": "Advanced Starter, Meerut Line", "position": { "x": 1000, "y": 210 }, "state": "RED" },
      { "id": "S-AS-DML", "type": "SIGNAL", "description": "Advanced Starter, DOWN Main Line", "position": { "x": 1000, "y": 290 }, "state": "RED" },

      { "id": "J-PF1-START", "type": "JUNCTION", "position": { "x": 350, "y": 50 }},
      { "id": "J-PF2-START", "type": "JUNCTION", "position": { "x": 350, "y": 90 }},
      { "id": "J-PF3-START", "type": "JUNCTION", "position": { "x": 350, "y": 130 }},
      { "id": "J-PF4-START", "type": "JUNCTION", "position": { "x": 350, "y": 170 }},
      { "id": "J-PF5-START", "type": "JUNCTION", "position": { "x": 350, "y": 210 }},
      { "id": "J-PF6-START", "type": "JUNCTION", "position": { "x": 350, "y": 250 }},
      { "id": "J-DN-THRU-START", "type": "JUNCTION", "position": { "x": 350, "y": 290 }},
      { "id": "J-DN-THRU-END", "type": "JUNCTION", "position": { "x": 700, "y": 290 }}
    ],
    "trackSegments": [
      { "id": "TC-UML-APP", "startNodeId": "S-H-UML", "endNodeId": "P-1A", "isOccupied": false },
      { "id": "TC-DML-APP", "startNodeId": "S-H-DML", "endNodeId": "P-1B", "isOccupied": false },
      { "id": "TC-UML2-APP", "startNodeId": "S-H-UML2", "endNodeId": "P-2C", "isOccupied": false },
      { "id": "TC-DML2-APP", "startNodeId": "S-H-DML2", "endNodeId": "P-2D", "isOccupied": false },

      { "id": "TC-1A-2A", "startNodeId": "P-1A", "endNodeId": "P-2A", "isOccupied": false },
      { "id": "TC-1B-2B", "startNodeId": "P-1B", "endNodeId": "P-2B", "isOccupied": false },
      { "id": "TC-P1A-P1B-X", "startNodeId": "P-1A", "endNodeId": "P-1B", "isOccupied": false },
      
      { "id": "TC-2A-PF1", "startNodeId": "P-2A", "endNodeId": "J-PF1-START", "isOccupied": false },
      { "id": "TC-2A-PF2", "startNodeId": "P-2A", "endNodeId": "J-PF2-START", "isOccupied": false },
      { "id": "TC-2B-PF3", "startNodeId": "P-2B", "endNodeId": "J-PF3-START", "isOccupied": false },
      { "id": "TC-2B-PF4", "startNodeId": "P-2B", "endNodeId": "J-PF4-START", "isOccupied": false },
      { "id": "TC-2C-PF5", "startNodeId": "P-2C", "endNodeId": "J-PF5-START", "isOccupied": false },
      { "id": "TC-2C-PF6", "startNodeId": "P-2C", "endNodeId": "J-PF6-START", "isOccupied": false },
      { "id": "TC-2D-THRU", "startNodeId": "P-2D", "endNodeId": "J-DN-THRU-START", "isOccupied": false },

      { "id": "TC-PF1", "startNodeId": "J-PF1-START", "endNodeId": "S-S1", "isOccupied": false },
      { "id": "TC-PF2", "startNodeId": "J-PF2-START", "endNodeId": "S-S2", "isOccupied": false },
      { "id": "TC-PF3", "startNodeId": "J-PF3-START", "endNodeId": "S-S3", "isOccupied": false },
      { "id": "TC-PF4", "startNodeId": "J-PF4-START", "endNodeId": "S-S4", "isOccupied": false },
      { "id": "TC-PF5", "startNodeId": "J-PF5-START", "endNodeId": "S-S5", "isOccupied": false },
      { "id": "TC-PF6", "startNodeId": "J-PF6-START", "endNodeId": "S-S6", "isOccupied": false },
      { "id": "TC-DN-THRU", "startNodeId": "J-DN-THRU-START", "endNodeId": "J-DN-THRU-END", "isOccupied": false },

      { "id": "TC-S1-P3A", "startNodeId": "S-S1", "endNodeId": "P-3A", "isOccupied": false },
      { "id": "TC-S2-P3A", "startNodeId": "S-S2", "endNodeId": "P-3A", "isOccupied": false },
      { "id": "TC-S3-P3B", "startNodeId": "S-S3", "endNodeId": "P-3B", "isOccupied": false },
      { "id": "TC-S4-P3B", "startNodeId": "S-S4", "endNodeId": "P-3B", "isOccupied": false },
      { "id": "TC-S5-P3C", "startNodeId": "S-S5", "endNodeId": "P-3C", "isOccupied": false },
      { "id": "TC-S6-P3C", "startNodeId": "S-S6", "endNodeId": "P-3C", "isOccupied": false },

      { "id": "TC-P3A-P4A", "startNodeId": "P-3A", "endNodeId": "P-4A", "isOccupied": false },
      { "id": "TC-P3B-P4A", "startNodeId": "P-3B", "endNodeId": "P-4A", "isOccupied": false },
      { "id": "TC-P3B-P4B", "startNodeId": "P-3B", "endNodeId": "P-4B", "isOccupied": false },
      { "id": "TC-P3C-P4B", "startNodeId": "P-3C", "endNodeId": "P-4B", "isOccupied": false },
      { "id": "TC-J-DN-THRU-END-AS-DML", "startNodeId": "J-DN-THRU-END", "endNodeId": "S-AS-DML", "isOccupied": false },

      { "id": "TC-P4A-MRD", "startNodeId": "P-4A", "endNodeId": "S-AS-MRD", "isOccupied": false },
      { "id": "TC-P4A-TDL", "startNodeId": "P-4A", "endNodeId": "S-AS-TDL", "isOccupied": false },
      { "id": "TC-P4B-MRT", "startNodeId": "P-4B", "endNodeId": "S-AS-MRT", "isOccupied": false },
      { "id": "TC-P4B-DML", "startNodeId": "P-4B", "endNodeId": "S-AS-DML", "isOccupied": false },

      { "id": "TC-EXIT-MRD", "startNodeId": "S-AS-MRD", "endNodeId": "TERMINAL-MRD", "isOccupied": false },
      { "id": "TC-EXIT-TDL", "startNodeId": "S-AS-TDL", "endNodeId": "TERMINAL-TDL", "isOccupied": false },
      { "id": "TC-EXIT-MRT", "startNodeId": "S-AS-MRT", "endNodeId": "TERMINAL-MRT", "isOccupied": false },
      { "id": "TC-EXIT-DML", "startNodeId": "S-AS-DML", "endNodeId": "TERMINAL-DML", "isOccupied": false }
    ],
    "platforms": [
      { "id": "PF-1", "name": "Platform 1", "trackSegmentId": "TC-PF1" },
      { "id": "PF-2", "name": "Platform 2", "trackSegmentId": "TC-PF2" },
      { "id": "PF-3", "name": "Platform 3", "trackSegmentId": "TC-PF3" },
      { "id": "PF-4", "name": "Platform 4", "trackSegmentId": "TC-PF4" },
      { "id": "PF-5", "name": "Platform 5", "trackSegmentId": "TC-PF5" },
      { "id": "PF-6", "name": "Platform 6", "trackSegmentId": "TC-PF6" }
    ],
    "routes": [
      {
        "id": "R-UML-PF3-TDL",
        "description": "UP Main Line (Delhi side) to Platform 3, departing to Tundla",
        "entrySignal": "S-H-DML",
        "exitSignal": "S-AS-TDL",
        "trackSegments": ["TC-DML-APP", "TC-1B-2B", "TC-2B-PF3", "TC-PF3", "TC-S3-P3B", "TC-P3B-P4A", "TC-P4A-TDL"],
        "pointSettings": [
          { "pointId": "P-1B", "requiredState": "NORMAL" },
          { "pointId": "P-2B", "requiredState": "NORMAL" },
          { "pointId": "P-3B", "requiredState": "NORMAL" },
          { "pointId": "P-4A", "requiredState": "NORMAL" }
        ],
        "state": "FREE"
      },
      {
        "id": "R-UML-PF5-MRT",
        "description": "UP Main Line 2 (Delhi side) to Platform 5, departing to Meerut",
        "entrySignal": "S-H-UML2",
        "exitSignal": "S-AS-MRT",
        "trackSegments": ["TC-UML2-APP", "TC-2C-PF5", "TC-PF5", "TC-S5-P3C", "TC-P3C-P4B", "TC-P4B-MRT"],
        "pointSettings": [
          { "pointId": "P-2C", "requiredState": "NORMAL" },
          { "pointId": "P-3C", "requiredState": "NORMAL" },
          { "pointId": "P-4B", "requiredState": "NORMAL" }
        ],
        "state": "FREE"
      },
      {
        "id": "R-UML-PF2-MRD",
        "description": "UP Main Line (Delhi side) to Platform 2, departing to Moradabad",
        "entrySignal": "S-H-UML",
        "exitSignal": "S-AS-MRD",
        "trackSegments": ["TC-UML-APP", "TC-1A-2A", "TC-2A-PF2", "TC-PF2", "TC-S2-P3A", "TC-P3A-MRD"],
        "pointSettings": [
          { "pointId": "P-1A", "requiredState": "NORMAL" },
          { "pointId": "P-2A", "requiredState": "REVERSE" },
          { "pointId": "P-3A", "requiredState": "REVERSE" }
        ],
        "state": "FREE"
      },
      {
        "id": "R-DML-THRU",
        "description": "Down Main Line 2 (Delhi side) through line",
        "entrySignal": "S-H-DML2",
        "exitSignal": "S-AS-DML",
        "trackSegments": ["TC-DML2-APP", "TC-2D-THRU", "TC-DN-THRU", "TC-J-DN-THRU-END-AS-DML"],
        "pointSettings": [
          { "pointId": "P-2D", "requiredState": "NORMAL" }
        ],
        "state": "FREE"
      }
    ]
  },
  "trains": [
    {
      "id": "12420-GOMTI-EXP",
      "currentSegmentId": null,
      "positionOnSegment": 0,
      "routeId": null,
      "state": "STOPPED",
      "description": "Waiting to be spawned"
    },
    {
      "id": "12034-NDLS-CNB-SHT",
      "currentSegmentId": null,
      "positionOnSegment": 0,
      "routeId": null,
      "state": "STOPPED",
      "description": "Waiting to be spawned"
    }
  ]
};

// Add terminal nodes to handle track segments that go off-screen.
// This makes the rendering logic simpler and prevents errors.
layoutData.network.nodes.push(
    { "id": "TERMINAL-MRD", "type": "TERMINAL", "position": { "x": 1150, "y": 50 } },
    { "id": "TERMINAL-TDL", "type": "TERMINAL", "position": { "x": 1150, "y": 130 } },
    { "id": "TERMINAL-MRT", "type": "TERMINAL", "position": { "x": 1150, "y": 210 } },
    { "id": "TERMINAL-DML", "type": "TERMINAL", "position": { "x": 1150, "y": 290 } }
);

// Manually set a track segment to 'occupied' for visual demonstration.
// This shows that the UI is correctly reflecting the data model.
const occupiedSegment = layoutData.network.trackSegments.find(s => s.id === "TC-PF3");
if (occupiedSegment) {
    occupiedSegment.isOccupied = true;
}

// Export the data so it can be imported into other files, like MainContent.js
module.exports = layoutData;