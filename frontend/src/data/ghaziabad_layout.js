// This file is the "single source of truth" for the simulation.
// It uses the ES Module system for the React frontend.

const layoutData = {
  "stationName": "Ghaziabad Junction (GZB)",
  "systemStatus": {
    "power": "OPERATIONAL", // Can be "DEGRADED" or "FAILED"
    "signalling": "OPERATIONAL", // Can be "DEGRADED" or "FAILED"
    "externalHazards": [] // e.g., ["TRESPASSER_ON_TRACK_TC-PF4"]
  },
  "network": {
    "nodes": [
      // Signals now have manual override flags
      { "id": "S-H-UML", "type": "SIGNAL", "position": { "x": 50, "y": 100 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-H-DML", "type": "SIGNAL", "position": { "x": 50, "y": 150 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-H-UML2", "type": "SIGNAL", "position": { "x": 50, "y": 200 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-H-DML2", "type": "SIGNAL", "position": { "x": 50, "y": 250 }, "state": "RED", "isManuallyOverridden": false },

      // Points now have a locked status
      { "id": "P-1A", "type": "POINT_SWITCH", "position": { "x": 150, "y": 100 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-1B", "type": "POINT_SWITCH", "position": { "x": 150, "y": 150 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-2A", "type": "POINT_SWITCH", "position": { "x": 250, "y": 100 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-2B", "type": "POINT_SWITCH", "position": { "x": 250, "y": 150 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-2C", "type": "POINT_SWITCH", "position": { "x": 250, "y": 200 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-2D", "type": "POINT_SWITCH", "position": { "x": 250, "y": 250 }, "state": "NORMAL", "isLocked": false },
      
      { "id": "S-S1", "type": "SIGNAL", "position": { "x": 700, "y": 50 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-S2", "type": "SIGNAL", "position": { "x": 700, "y": 90 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-S3", "type": "SIGNAL", "position": { "x": 700, "y": 130 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-S4", "type": "SIGNAL", "position": { "x": 700, "y": 170 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-S5", "type": "SIGNAL", "position": { "x": 700, "y": 210 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-S6", "type": "SIGNAL", "position": { "x": 700, "y": 250 }, "state": "RED", "isManuallyOverridden": false },

      { "id": "P-3A", "type": "POINT_SWITCH", "position": { "x": 800, "y": 70 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-3B", "type": "POINT_SWITCH", "position": { "x": 800, "y": 150 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-3C", "type": "POINT_SWITCH", "position": { "x": 800, "y": 230 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-4A", "type": "POINT_SWITCH", "position": { "x": 900, "y": 90 }, "state": "NORMAL", "isLocked": false },
      { "id": "P-4B", "type": "POINT_SWITCH", "position": { "x": 900, "y": 250 }, "state": "NORMAL", "isLocked": false },

      { "id": "S-AS-MRD", "type": "SIGNAL", "position": { "x": 1000, "y": 50 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-AS-TDL", "type": "SIGNAL", "position": { "x": 1000, "y": 130 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-AS-MRT", "type": "SIGNAL", "position": { "x": 1000, "y": 210 }, "state": "RED", "isManuallyOverridden": false },
      { "id": "S-AS-DML", "type": "SIGNAL", "position": { "x": 1000, "y": 290 }, "state": "RED", "isManuallyOverridden": false },
      
      { "id": "J-PF1-START", "type": "JUNCTION", "position": { "x": 350, "y": 50 }},
      { "id": "J-PF2-START", "type": "JUNCTION", "position": { "x": 350, "y": 90 }},
      { "id": "J-PF3-START", "type": "JUNCTION", "position": { "x": 350, "y": 130 }},
      { "id": "J-PF4-START", "type": "JUNCTION", "position": { "x": 350, "y": 170 }},
      { "id": "J-PF5-START", "type": "JUNCTION", "position": { "x": 350, "y": 210 }},
      { "id": "J-PF6-START", "type": "JUNCTION", "position": { "x": 350, "y": 250 }},
      { "id": "J-DN-THRU-START", "type": "JUNCTION", "position": { "x": 350, "y": 290 }},
      { "id": "J-DN-THRU-END", "type": "JUNCTION", "position": { "x": 700, "y": 290 }},
      { "id": "TERMINAL-MRD", "type": "TERMINAL", "position": { "x": 1150, "y": 50 } },
      { "id": "TERMINAL-TDL", "type": "TERMINAL", "position": { "x": 1150, "y": 130 } },
      { "id": "TERMINAL-MRT", "type": "TERMINAL", "position": { "x": 1150, "y": 210 } },
      { "id": "TERMINAL-DML", "type": "TERMINAL", "position": { "x": 1150, "y": 290 } }
    ],
    "trackSegments": [
      { "id": "TC-UML-APP", "startNodeId": "S-H-UML", "endNodeId": "P-1A", "length": 1000, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-DML-APP", "startNodeId": "S-H-DML", "endNodeId": "P-1B", "length": 1000, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-UML2-APP", "startNodeId": "S-H-UML2", "endNodeId": "P-2C", "length": 1000, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-DML2-APP", "startNodeId": "S-H-DML2", "endNodeId": "P-2D", "length": 1000, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-1A-2A", "startNodeId": "P-1A", "endNodeId": "P-2A", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-1B-2B", "startNodeId": "P-1B", "endNodeId": "P-2B", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P1A-P1B-X", "startNodeId": "P-1A", "endNodeId": "P-1B", "length": 50, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      
      { "id": "TC-2A-PF1", "startNodeId": "P-2A", "endNodeId": "J-PF1-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2A-PF2", "startNodeId": "P-2A", "endNodeId": "J-PF2-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2B-PF3", "startNodeId": "P-2B", "endNodeId": "J-PF3-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2B-PF4", "startNodeId": "P-2B", "endNodeId": "J-PF4-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2C-PF5", "startNodeId": "P-2C", "endNodeId": "J-PF5-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2C-PF6", "startNodeId": "P-2C", "endNodeId": "J-PF6-START", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-2D-THRU", "startNodeId": "P-2D", "endNodeId": "J-DN-THRU-START", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-PF1", "startNodeId": "J-PF1-START", "endNodeId": "S-S1", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-PF2", "startNodeId": "J-PF2-START", "endNodeId": "S-S2", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-PF3", "startNodeId": "J-PF3-START", "endNodeId": "S-S3", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-PF4", "startNodeId": "J-PF4-START", "endNodeId": "S-S4", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": null, "status": "FAULTY", "isOccupied": false },
      { "id": "TC-PF5", "startNodeId": "J-PF5-START", "endNodeId": "S-S5", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": 20, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-PF6", "startNodeId": "J-PF6-START", "endNodeId": "S-S6", "length": 350, "maxSpeed": 30, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-DN-THRU", "startNodeId": "J-DN-THRU-START", "endNodeId": "J-DN-THRU-END", "length": 350, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-S1-P3A", "startNodeId": "S-S1", "endNodeId": "P-3A", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-S2-P3A", "startNodeId": "S-S2", "endNodeId": "P-3A", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-S3-P3B", "startNodeId": "S-S3", "endNodeId": "P-3B", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-S4-P3B", "startNodeId": "S-S4", "endNodeId": "P-3B", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-S5-P3C", "startNodeId": "S-S5", "endNodeId": "P-3C", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-S6-P3C", "startNodeId": "S-S6", "endNodeId": "P-3C", "length": 100, "maxSpeed": 40, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-P3A-P4A", "startNodeId": "P-3A", "endNodeId": "P-4A", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P3B-P4A", "startNodeId": "P-3B", "endNodeId": "P-4A", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P3B-P4B", "startNodeId": "P-3B", "endNodeId": "P-4B", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P3C-P4B", "startNodeId": "P-3C", "endNodeId": "P-4B", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-J-DN-THRU-END-AS-DML", "startNodeId": "J-DN-THRU-END", "endNodeId": "S-AS-DML", "length": 300, "maxSpeed": 80, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-P4A-MRD", "startNodeId": "P-4A", "endNodeId": "S-AS-MRD", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P4A-TDL", "startNodeId": "P-4A", "endNodeId": "S-AS-TDL", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P4B-MRT", "startNodeId": "P-4B", "endNodeId": "S-AS-MRT", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-P4B-DML", "startNodeId": "P-4B", "endNodeId": "S-AS-DML", "length": 100, "maxSpeed": 60, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },

      { "id": "TC-EXIT-MRD", "startNodeId": "S-AS-MRD", "endNodeId": "TERMINAL-MRD", "length": 1500, "maxSpeed": 120, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-EXIT-TDL", "startNodeId": "S-AS-TDL", "endNodeId": "TERMINAL-TDL", "length": 1500, "maxSpeed": 120, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-EXIT-MRT", "startNodeId": "S-AS-MRT", "endNodeId": "TERMINAL-MRT", "length": 1500, "maxSpeed": 120, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false },
      { "id": "TC-EXIT-DML", "startNodeId": "S-AS-DML", "endNodeId": "TERMINAL-DML", "length": 1500, "maxSpeed": 120, "tempSpeedRestriction": null, "status": "OPERATIONAL", "isOccupied": false }
    ],
    "routes": [
      {
        "id": "R-UML-PF3-TDL", "description": "UP Main Line to Plat 3, depart Tundla", "entrySignal": "S-H-DML", "exitSignal": "S-AS-TDL",
        "trackSegments": ["TC-DML-APP", "TC-1B-2B", "TC-2B-PF3", "TC-PF3", "TC-S3-P3B", "TC-P3B-P4A", "TC-P4A-TDL", "TC-EXIT-TDL"],
        "pointSettings": [ { "pointId": "P-1B", "requiredState": "NORMAL" }, { "pointId": "P-2B", "requiredState": "NORMAL" }, { "pointId": "P-3B", "requiredState": "NORMAL" }, { "pointId": "P-4A", "requiredState": "NORMAL" } ],
        "isLockedByTrainId": null
      },
      {
        "id": "R-UML-PF5-MRT", "description": "UP Main Line 2 to Plat 5, depart Meerut", "entrySignal": "S-H-UML2", "exitSignal": "S-AS-MRT",
        "trackSegments": ["TC-UML2-APP", "TC-2C-PF5", "TC-PF5", "TC-S5-P3C", "TC-P3C-P4B", "TC-P4B-MRT", "TC-EXIT-MRT"],
        "pointSettings": [ { "pointId": "P-2C", "requiredState": "NORMAL" }, { "pointId": "P-3C", "requiredState": "NORMAL" }, { "pointId": "P-4B", "requiredState": "NORMAL" } ],
        "isLockedByTrainId": null
      },
      {
        "id": "R-UML-PF2-MRD", "description": "UP Main Line to Plat 2, depart Moradabad", "entrySignal": "S-H-UML", "exitSignal": "S-AS-MRD",
        "trackSegments": ["TC-UML-APP", "TC-1A-2A", "TC-2A-PF2", "TC-PF2", "TC-S2-P3A", "TC-P3A-P4A", "TC-P4A-MRD", "TC-EXIT-MRD"],
        "pointSettings": [ { "pointId": "P-1A", "requiredState": "NORMAL" }, { "pointId": "P-2A", "requiredState": "REVERSE" }, { "pointId": "P-3A", "requiredState": "NORMAL" }, { "pointId": "P-4A", "requiredState": "REVERSE" } ],
        "isLockedByTrainId": null
      },
      {
        "id": "R-DML-THRU", "description": "Down Main Line 2 through line", "entrySignal": "S-H-DML2", "exitSignal": "S-AS-DML",
        "trackSegments": ["TC-DML2-APP", "TC-2D-THRU", "TC-DN-THRU", "TC-J-DN-THRU-END-AS-DML", "TC-EXIT-DML"],
        "pointSettings": [ { "pointId": "P-2D", "requiredState": "NORMAL" } ],
        "isLockedByTrainId": null
      }
    ]
  },
  "trains": [
    {
      "id": "12417-PRAYAGRAJ_EXP", "type": "Express", "priority": 8, "length": 450, "maxSpeed": 130,
      "currentSegmentId": null, "positionOnSegment": 0, "routeId": null, "state": "STOPPED", "delay": 0
    },
    {
      "id": "12003-LKO_SHTBDI", "type": "Express", "priority": 9, "length": 400, "maxSpeed": 130,
      "currentSegmentId": null, "positionOnSegment": 0, "routeId": null, "state": "STOPPED", "delay": 0
    },
    {
      "id": "54472-DLI_RE_PASS", "type": "Passenger", "priority": 4, "length": 300, "maxSpeed": 100,
      "currentSegmentId": null, "positionOnSegment": 0, "routeId": null, "state": "STOPPED", "delay": 0
    },
    {
      "id": "GZB-FREIGHT-01", "type": "Freight", "priority": 2, "length": 700, "maxSpeed": 75,
      "currentSegmentId": null, "positionOnSegment": 0, "routeId": null, "state": "STOPPED", "delay": 0
    }
  ]
};

// Use ES Module export for the React frontend
export default layoutData;