export {
  clearLimitSwitchMode,
  combineLimitSwitchStates,
  getLimitSwitchModeStatus,
  isLatched,
  isMotionBlocked,
  limitSwitchModeErrorMessage,
  registerOnEngage,
  runWithHomingBypass,
  runWithRecoveryBypass,
  tryClearIfSafe,
  updateLimitSwitchState,
  updateMotorPosition,
  type LimitReason,
  type LimitSide,
  type LimitSwitchModeStatus,
} from "./state.js";

export {
  startRecoveryJog,
  stopRecoveryJog,
  recoveryJogCmPerSecTowardCenter,
  recoveryJogRpmTowardCenter,
} from "./recoveryJog.js";
export { moveHomeWhileLatched, type MoveHomeLeafResult, type MoveHomeResult } from "./moveHome.js";

import { registerOnEngage } from "./state.js";
import { stopAllMotionOnEngage } from "./stopOnEngage.js";

registerOnEngage(stopAllMotionOnEngage);
