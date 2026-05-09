#pragma once

/** Hub serial / motion limits — edit here for your machine (rebuild teknic_motor.dll). */
namespace TeknicCfg {

// USB enumeration can lag briefly after plug-in; Teknic MotionVelocity assumes USB discovery works.
constexpr int kFindComHubAttempts = 4;
constexpr int kFindComHubRetryDelayMs = 250;

#if defined(_WIN32) || defined(_WIN64)
// SCNetworkReport: if argc >= 2, ComHubPort(0, comNum) and skip FindComHubPorts.
// Set >= 1 to force that path (COM5 → 5). 0 = discover via FindComHubPorts only.
constexpr int kManualComWhenDiscoveryEmpty = 0;

// If FindComHubPorts is empty and manual COM is not set, try ComHubPort(0, n) for each n in [min,max].
// Disabled when min < 1 or max < min. Use 0,0 to turn off and rely on manual COM or hub USB only.
constexpr int kComPortScanMin = 1;
constexpr int kComPortScanMax = 25;
constexpr int kComPortScanFailGapMs = 50;
#endif

constexpr int kPostOpenDelayMs = 100;
constexpr int kWaitOnlineMs = 10000;  // 0 = skip IPort::WaitForOnline

// 1 = teknic_init fails (-7) if INode::Setup.AccessLevelIsFull() is false (LoadingConfigFile.cpp).
// 0 = skip that check. Teknic exposes no API to *grant* full access — only this query. Use 0 when
// you connect only via the motor diagnostic USB (sole client) but AccessLevelIsFull still reads
// false, or after power-cycling the motor with ClearView fully quit.
constexpr int kRequireAccessLevelFull = 1;

// Used when kHostVelocityParamsBeforeEnable == 2 (host Motion.AccLimit before EnableReq).
constexpr int kAccLimitRpmPerSec = 1000;

// MotionVelocity.cpp order before EnableReq: AccUnit → AccLimit → VelUnit (see Teknic SDK examples).
// 0 = set none (MSP owns everything).
// 1 = AccUnit + VelUnit only (skips host AccLimit — avoids Parameter(62) if MSP locks AccLimit).
// 2 = AccUnit + AccLimit + VelUnit (matches MotionVelocity.cpp lines 78–83; may hit Parameter(62)).
constexpr int kHostVelocityParamsBeforeEnable = 1;

// 0 = SCNetworkReport-style: open port(s) and read node IInfo only — no EnableReq, no NodeStopClear,
// no AlertsClear, no motion. UI shows motor data; jog returns an error.
// 1 = full connect (enable axis for MoveVelStart / jog). Default: allow rail jog from the web UI.
constexpr int kEnableReqOnConnect = 1;

// 1 = call EnableReq(false), gap, then EnableReq(true). MotionVelocity uses 0.
constexpr int kPreEnableDisable = 0;
constexpr int kPreEnableDisableGapMs = 50;

constexpr int kEnableRetries = 4;
constexpr int kEnableRetryGapMs = 150;

// Software clamp on commanded jog velocity (MoveVelStart argument magnitude).
constexpr int kJogVelLimitRpm = 500;

// Upper bounds for MovePosnStart profile limits when the API sends explicit max_velocity_rpm /
// max_acceleration_rpm_per_sec (UI). Jog limits above must NOT cap these — otherwise position moves
// stay stuck at jog speed (~500 RPM) even when the operator requests higher.
constexpr int kPositionMoveVelCeilingRpm = 4000;
constexpr int kPositionMoveAccCeilingRpmPerSec = 50000;

}  // namespace TeknicCfg
