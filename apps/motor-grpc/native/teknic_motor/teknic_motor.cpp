/*
 * Teknic ClearPath-SC — thin DLL for Node motor-grpc (velocity jog).
 * Hub open sequence follows Teknic SCNetworkReport.cpp: optional manual COM (argv-style), else
 * FindComHubPorts then ComHubPort per index. Motion/jog setup follows MotionVelocity (MoveVelStart).
 *
 * FindComHubPorts only enumerates the SC4-HUB USB adapter (VID/PID in infcGetHubPorts); motor
 * diagnostic USB / RS-232 use manual COM (same as SCNetworkReport.exe <COM index>).
 * Hub/motor tuning is in TeknicCfg — no TEKNIC_* environment variables.
 */

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#include "pubSysCls.h"

using namespace sFnd;

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

namespace {

std::recursive_mutex g_mu;

SysManager* g_mgr = nullptr;
INode* g_node = nullptr;

double g_commanded_rpm = 0.0;
bool g_initialized = false;
bool g_motion_enabled = false;

std::string g_detail;

static void set_detail_from_node(INode& node) {
  char buf[512];
  snprintf(buf, sizeof(buf), "Teknic node %d | %s | %s", node.Info.Ex.NodeIndex(),
           node.Info.UserID.Value(), node.Info.Model.Value());
  g_detail = buf;
}

static std::string json_escape(const char* s) {
  std::string r;
  if (!s) return r;
  for (const char* p = s; *p; ++p) {
    switch (*p) {
      case '"':
      case '\\':
        r += '\\';
        r += *p;
        break;
      case '\n':
      case '\r':
        break;
      default:
        r += *p;
        break;
    }
  }
  return r;
}

/** JSON object for MotorInfo (parsed in Node). Matches Teknic pubSysCls IInfo / IInfoEx. */
static std::string motor_info_json(INode& n) {
  const int node_index = static_cast<int>(n.Info.Ex.NodeIndex());
  const IInfo::nodeTypes nt = n.Info.NodeType();
  const int node_type_code = static_cast<int>(nt);
  const char* type_label = "UNKNOWN";
  if (nt == IInfo::CLEARPATH_SC) {
    type_label = "ClearPath SC";
  } else if (nt == IInfo::CLEARPATH_SC_ADV) {
    type_label = "ClearPath SC Advanced";
  } else if (nt == IInfo::UNKNOWN) {
    type_label = "UNKNOWN";
  }

  const char* uid = "";
  const char* fw = "";
  const char* model = "";
  try {
    uid = n.Info.UserID.Value();
  } catch (...) {
  }
  try {
    fw = n.Info.FirmwareVersion.Value();
  } catch (...) {
  }
  try {
    model = n.Info.Model.Value();
  } catch (...) {
  }

  unsigned serial = 0;
  try {
    serial = static_cast<unsigned>(n.Info.SerialNumber);
  } catch (...) {
  }

  std::ostringstream o;
  o << "{\"node_index\":" << node_index << ",\"node_type_code\":" << node_type_code
    << ",\"node_type_label\":\"" << json_escape(type_label) << "\",\"user_id\":\"" << json_escape(uid)
    << "\",\"firmware_version\":\"" << json_escape(fw) << "\",\"serial_number\":" << serial
    << ",\"model\":\"" << json_escape(model) << "\"}";
  return o.str();
}

static int clamp_rpm_int(double rpm, int limit) {
  if (!std::isfinite(rpm)) return 0;
  double clamped = std::max(-static_cast<double>(limit), std::min(static_cast<double>(limit), rpm));
  return static_cast<int>(clamped);
}

static void sleep_ms(int ms) {
  if (ms > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
  }
}

}  // namespace

extern "C" {

__declspec(dllexport) int __cdecl teknic_init(void) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  g_detail.clear();
  if (g_initialized) {
    return 0;
  }

  try {
    g_mgr = SysManager::Instance();

    std::vector<std::string> comHubPorts;
    size_t portsToOpen = 0;
    bool need_shared_ports_open = true;

#if defined(_WIN32) || defined(_WIN64)
    if (TeknicCfg::kManualComWhenDiscoveryEmpty >= 1) {
      const int comNum = TeknicCfg::kManualComWhenDiscoveryEmpty;
      g_mgr->ComHubPort(0, comNum);
      portsToOpen = 1;
      char hint[160];
      snprintf(hint, sizeof(hint), "Manual COM%d (TeknicCfg; SCNetworkReport argv path)", comNum);
      g_detail = hint;
    } else
#endif
    {
      for (int attempt = 0; attempt < TeknicCfg::kFindComHubAttempts; ++attempt) {
        if (attempt > 0) {
          sleep_ms(TeknicCfg::kFindComHubRetryDelayMs);
        }
        SysManager::FindComHubPorts(comHubPorts);
        if (!comHubPorts.empty()) {
          break;
        }
      }

      if (!comHubPorts.empty()) {
        for (size_t port = 0; port < comHubPorts.size(); ++port) {
          g_mgr->ComHubPort(port, comHubPorts[port].c_str());
        }
        portsToOpen = comHubPorts.size();
        char hint[384];
        snprintf(hint, sizeof(hint), "FindComHubPorts: %zu hub(s), port0 \"%s\"", comHubPorts.size(),
                 comHubPorts[0].c_str());
        g_detail = hint;
      } else {
#if defined(_WIN32) || defined(_WIN64)
        const int scan_min = TeknicCfg::kComPortScanMin;
        const int scan_max = TeknicCfg::kComPortScanMax;
        int found_com = 0;
        if (scan_min >= 1 && scan_max >= scan_min) {
          for (int com = scan_min; com <= scan_max; ++com) {
            try {
              g_mgr->ComHubPort(0, com);
              g_mgr->PortsOpen(1);
              IPort& probe = g_mgr->Ports(0);
              if (probe.NodeCount() >= 1) {
                found_com = com;
                portsToOpen = 1;
                char hint[224];
                snprintf(hint, sizeof(hint), "COM scan: COM%d (tried COM%d..COM%d)", com, scan_min,
                         scan_max);
                g_detail = hint;
                need_shared_ports_open = false;
                break;
              }
            } catch (mnErr&) {
            } catch (...) {
            }
            try {
              g_mgr->PortsClose();
            } catch (...) {
            }
            sleep_ms(TeknicCfg::kComPortScanFailGapMs);
          }
        }
        if (found_com == 0) {
          g_detail =
              "No SC4-HUB's found (FindComHubPorts). Set TeknicCfg::kManualComWhenDiscoveryEmpty, or "
              "enable TeknicCfg::kComPortScanMin/kComPortScanMax (e.g. 1..30) to probe COM ports. "
              "Quit ClearView if it holds the COM.";
          return -2;
        }
#else
        g_detail =
            "No SC4-HUB's found (FindComHubPorts). Ensure SC4-HUB via USB and 24 V, or use a platform "
            "with manual COM / COM scan support.";
        return -2;
#endif
      }
    }

    if (need_shared_ports_open) {
      g_mgr->PortsOpen(portsToOpen);
    }

    sleep_ms(TeknicCfg::kPostOpenDelayMs);

    IPort& myPort = g_mgr->Ports(0);
    if (myPort.NodeCount() < 1) {
      g_detail = "No ClearPath node on port (expected at least one node).";
      g_mgr->PortsClose();
      g_mgr = nullptr;
      return -3;
    }

    if (TeknicCfg::kWaitOnlineMs > 0) {
      if (!myPort.WaitForOnline(TeknicCfg::kWaitOnlineMs)) {
        g_detail =
            "WaitForOnline timed out — confirm hub 24V, motor power, cabling, and that "
            "FindComHubPorts listed the correct hub.";
        g_mgr->PortsClose();
        g_mgr = nullptr;
        return -6;
      }
    }

    INode& myNode = myPort.Nodes(0);

    g_motion_enabled = false;
    if (TeknicCfg::kEnableReqOnConnect != 0) {
      // Optional MotionVelocity-style setup (before EnableReq).
      if (TeknicCfg::kHostVelocityParamsBeforeEnable != 0) {
        myNode.VelUnit(INode::RPM);
        try {
          myNode.AccUnit(INode::RPM_PER_SEC);
        } catch (mnErr&) {
        }
        try {
          myNode.Motion.AccLimit = TeknicCfg::kAccLimitRpmPerSec;
        } catch (mnErr&) {
        }
      }
      try {
        myNode.Motion.NodeStopClear();
      } catch (mnErr&) {
      }
      try {
        myNode.Status.AlertsClear();
      } catch (mnErr&) {
      }

      if (TeknicCfg::kPreEnableDisable != 0) {
        try {
          myNode.EnableReq(false);
        } catch (mnErr&) {
        }
        sleep_ms(TeknicCfg::kPreEnableDisableGapMs);
      }

      {
        const int en_retries = std::max(1, TeknicCfg::kEnableRetries);
        const int en_gap = std::max(0, TeknicCfg::kEnableRetryGapMs);
        bool en_ok = false;
        for (int attempt = 0; attempt < en_retries; attempt++) {
          try {
            myNode.EnableReq(true);
            en_ok = true;
            break;
          } catch (mnErr& e) {
            char stage[512];
            snprintf(stage, sizeof(stage),
                     "EnableReq attempt %d/%d: mnErr 0x%08x — %s", attempt + 1, en_retries,
                     static_cast<unsigned>(e.ErrorCode), e.ErrorMsg);
            g_detail = stage;
            if (attempt + 1 < en_retries) {
              sleep_ms(en_gap);
            }
          }
        }
        if (!en_ok) {
          try {
            myNode.EnableReq(false);
          } catch (...) {
          }
          if (!g_detail.empty()) {
            g_detail += " ";
          }
          if (TeknicCfg::kHostVelocityParamsBeforeEnable != 0) {
            g_detail +=
                "Hint: adjust TeknicCfg::kAccLimitRpmPerSec or MSP/ClearView toward factory defaults "
                "for MotionVelocity-style host velocity.";
          } else {
            g_detail +=
                "Hint: host VelUnit/AccLimit were not applied (kHostVelocityParamsBeforeEnable=0); "
                "adjust motion limits in MSP/ClearView or set kHostVelocityParamsBeforeEnable=1 if allowed.";
          }
          g_mgr->PortsClose();
          g_mgr = nullptr;
          return -100;
        }
      }

      double timeout = g_mgr->TimeStampMsec() + 15000.0;
      while (!myNode.Motion.IsReady()) {
        if (g_mgr->TimeStampMsec() > timeout) {
          g_detail = "Timed out waiting for node to enable (Ready).";
          myNode.EnableReq(false);
          g_mgr->PortsClose();
          g_mgr = nullptr;
          return -4;
        }
      }
      g_motion_enabled = true;
    }

    set_detail_from_node(myNode);
    if (!g_motion_enabled) {
      g_detail += " | info-only (TeknicCfg::kEnableReqOnConnect=0, no motion)";
    }
    g_node = &myNode;
    g_commanded_rpm = 0.0;
    g_initialized = true;
    return 0;
  } catch (mnErr& theErr) {
    char buf[384];
    snprintf(buf, sizeof(buf), "Teknic mnErr 0x%08x: %s", theErr.ErrorCode, theErr.ErrorMsg);
    g_detail = buf;
    if (g_mgr) {
      try {
        g_mgr->PortsClose();
      } catch (...) {
      }
      g_mgr = nullptr;
    }
    g_node = nullptr;
    return -100;
  }
}

__declspec(dllexport) void __cdecl teknic_shutdown(void) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  if (!g_initialized || !g_mgr || !g_node) {
    g_node = nullptr;
    g_initialized = false;
    g_motion_enabled = false;
    return;
  }

  try {
    if (g_motion_enabled) {
      g_node->Motion.MoveVelStart(0);
      g_commanded_rpm = 0;
      g_node->EnableReq(false);
    }
    g_mgr->PortsClose();
  } catch (...) {
  }

  g_node = nullptr;
  g_mgr = nullptr;
  g_initialized = false;
  g_motion_enabled = false;
  g_detail.clear();
}

__declspec(dllexport) int __cdecl teknic_set_velocity_rpm(double rpm) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  if (!g_initialized || !g_node) {
    return -1;
  }
  if (!g_motion_enabled) {
    g_detail =
        "Info-only link (TeknicCfg::kEnableReqOnConnect=0); motor data only — set kEnableReqOnConnect=1 "
        "to enable jog.";
    return -12;
  }

  const int vel_limit = TeknicCfg::kJogVelLimitRpm;

  try {
    if (!g_node->Motion.IsReady()) {
      return -5;
    }

    try {
      g_node->VelUnit(INode::RPM);
    } catch (mnErr&) {
    }

    int cmd = clamp_rpm_int(rpm, vel_limit);

    g_node->Motion.MoveVelStart(cmd);
    g_commanded_rpm = static_cast<double>(cmd);

    return 0;
  } catch (mnErr& theErr) {
    char buf[384];
    snprintf(buf, sizeof(buf), "Move mnErr 0x%08x: %s", theErr.ErrorCode, theErr.ErrorMsg);
    g_detail = buf;
    return -100;
  }
}

__declspec(dllexport) int __cdecl teknic_stop(void) {
  return teknic_set_velocity_rpm(0.0);
}

__declspec(dllexport) double __cdecl teknic_get_commanded_rpm(void) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  return g_commanded_rpm;
}

__declspec(dllexport) int __cdecl teknic_is_connected(void) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  return g_initialized ? 1 : 0;
}

__declspec(dllexport) const char* __cdecl teknic_get_detail(void) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  return g_detail.c_str();
}

/**
 * Writes UTF-8 JSON from IInfo (same source as SCNetworkReport-style scan).
 * Returns JSON byte length (excluding '\0'), or -1 not connected, -2 runtime error,
 * -3 bad args, -4 buffer too small.
 */
__declspec(dllexport) int __cdecl teknic_get_motor_info_json(char* out, int cap) {
  std::lock_guard<std::recursive_mutex> lock(g_mu);
  if (!out || cap < 64) {
    return -3;
  }
  out[0] = '\0';
  if (!g_initialized || !g_node) {
    return -1;
  }
  try {
    std::string j = motor_info_json(*g_node);
    if (static_cast<int>(j.size()) + 1 > cap) {
      return -4;
    }
    memcpy(out, j.c_str(), j.size() + 1);
    return static_cast<int>(j.size());
  } catch (...) {
    return -2;
  }
}

}  // extern "C"
