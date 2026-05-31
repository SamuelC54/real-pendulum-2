export type RailHomingResult = {
  ok: boolean;
  error?: string;
  motorPositionAtLeftLimit?: number;
  motorPositionAtRightLimit?: number;
  motorSpanCounts?: number;
  midMotorPosition?: number;
  motorPositionZeroedAtMid?: boolean;
  motorAbsRevolutions?: number;
  log: string[];
};
