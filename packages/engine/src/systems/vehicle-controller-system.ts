/** @deprecated — import from physics-controller-system.js */
export {
  PhysicsControllerSystem,
  VehicleControllerSystem,
  computeDriveControlState,
  computeIsaacDriveControlState,
  raycastWheelConfigs,
  vehicleWheelConfigs,
  steerScaleAtSpeed,
  resolvePhysicsSteerAngle,
  MIN_PHYSICS_STEER_SPEED_MPS,
} from './physics-controller-system.js'
export type {
  ControllerInput,
  VehicleInput,
  DriveControlContext,
  DriveControlState,
} from './physics-controller-system.js'
