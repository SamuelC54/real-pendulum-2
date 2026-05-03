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

// MotionVelocity.cpp: AccLimit in RPM/s before EnableReq (only if kHostVelocityParamsBeforeEnable).
constexpr int kAccLimitRpmPerSec = 1000;

// 0 = do not set VelUnit / AccUnit / AccLimit before EnableReq (avoids Parameter(50) etc. when MSP
// owns motion limits). 1 = apply MotionVelocity-style host limits before enable.
constexpr int kHostVelocityParamsBeforeEnable = 0;

// 0 = SCNetworkReport-style: open port(s) and read node IInfo only — no EnableReq, no NodeStopClear,
// no AlertsClear, no motion. UI shows motor data; jog returns an error until this is 1.
// 1 = full connect (enable axis for MoveVelStart / jog).
constexpr int kEnableReqOnConnect = 0;

// 1 = call EnableReq(false), gap, then EnableReq(true). MotionVelocity uses 0.
constexpr int kPreEnableDisable = 0;
constexpr int kPreEnableDisableGapMs = 50;

constexpr int kEnableRetries = 4;
constexpr int kEnableRetryGapMs = 150;

// Software clamp on commanded jog velocity (MoveVelStart argument magnitude).
constexpr int kJogVelLimitRpm = 500;

}  // namespace TeknicCfg
