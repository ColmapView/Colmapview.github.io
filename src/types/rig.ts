// Type aliases for COLMAP rig IDs
export type RigId = number;
export type FrameId = number;

// Sensor types matching COLMAP
export const SensorType = {
  CAMERA: 0,
  IMU: 1,
} as const;

export type SensorType = (typeof SensorType)[keyof typeof SensorType];

// Sensor identifier (type + id)
export interface SensorId {
  type: SensorType;
  id: number;
}

// Quaternion + translation pose
export interface RigPose {
  qvec: [number, number, number, number]; // qw, qx, qy, qz
  tvec: [number, number, number];          // tx, ty, tz
}

// A sensor within a rig
export interface RigSensor {
  sensorId: SensorId;
  hasPose: boolean;
  pose?: RigPose; // sensor_from_rig transform (undefined = identity for reference sensor)
}

// A rig is a collection of rigidly-mounted sensors
export interface Rig {
  rigId: RigId;
  refSensorId: SensorId | null; // Reference sensor (identity pose)
  sensors: RigSensor[];
}

// Maps a sensor to its captured data (image ID for cameras)
export interface FrameDataMapping {
  sensorId: SensorId;
  dataId: number; // imageId for CAMERA sensors
}

// A frame is a single capture instance where all rig cameras captured simultaneously
export interface Frame {
  frameId: FrameId;
  rigId: RigId;
  rigFromWorld: RigPose; // Pose of the rig in world coordinates
  dataIds: FrameDataMapping[];
}

// Container for all rig data
export interface RigData {
  rigs: Map<RigId, Rig>;
  frames: Map<FrameId, Frame>;
}
