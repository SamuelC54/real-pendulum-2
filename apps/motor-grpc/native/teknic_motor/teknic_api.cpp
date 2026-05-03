/*
 * Teknic ClearPath-SC — DLL exports for Node motor-grpc.
 * Hub discovery/open: hub_connect.cpp. Optional axis enable: node_prepare.cpp. Motor JSON: motor_info.cpp.
 */

#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>

#include "pubSysCls.h"

#include "hub_connect.h"
#include "motor_info.h"
#include "node_prepare.h"
#include "teknic_cfg.h"
#include "teknic_session.h"
#include "teknic_util.h"

using namespace sFnd;

extern "C" {

__declspec(dllexport) int __cdecl teknic_init(void) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  g_teknic_detail.clear();
  if (g_teknic_initialized) {
    return 0;
  }

  try {
    g_teknic_mgr = SysManager::Instance();

    size_t ports_to_open = 0;
    bool need_shared_ports_open = true;
    const int hub_rc =
        teknic_hub_configure_ports(g_teknic_mgr, ports_to_open, need_shared_ports_open);
    if (hub_rc != 0) {
      return hub_rc;
    }

    if (need_shared_ports_open) {
      g_teknic_mgr->PortsOpen(ports_to_open);
    }

    teknic_sleep_ms(TeknicCfg::kPostOpenDelayMs);

    IPort& my_port = g_teknic_mgr->Ports(0);
    if (my_port.NodeCount() < 1) {
      g_teknic_detail = "No ClearPath node on port (expected at least one node).";
      g_teknic_mgr->PortsClose();
      g_teknic_mgr = nullptr;
      return -3;
    }

    if (TeknicCfg::kWaitOnlineMs > 0) {
      if (!my_port.WaitForOnline(TeknicCfg::kWaitOnlineMs)) {
        g_teknic_detail =
            "WaitForOnline timed out — confirm hub 24V, motor power, cabling, and that "
            "FindComHubPorts listed the correct hub.";
        g_teknic_mgr->PortsClose();
        g_teknic_mgr = nullptr;
        return -6;
      }
    }

    INode& my_node = my_port.Nodes(0);

    const int prep_rc = teknic_node_prepare_motion(g_teknic_mgr, my_node);
    if (prep_rc != 0) {
      return prep_rc;
    }

    teknic_detail_set_from_node(my_node);
    if (!g_teknic_motion_enabled) {
      g_teknic_detail += " | info-only (TeknicCfg::kEnableReqOnConnect=0, no motion)";
    }
    g_teknic_node = &my_node;
    g_teknic_commanded_rpm = 0.0;
    g_teknic_initialized = true;
    return 0;
  } catch (mnErr& theErr) {
    char buf[384];
    snprintf(buf, sizeof(buf), "Teknic mnErr 0x%08x: %s", theErr.ErrorCode, theErr.ErrorMsg);
    g_teknic_detail = buf;
    if (g_teknic_mgr) {
      try {
        g_teknic_mgr->PortsClose();
      } catch (...) {
      }
      g_teknic_mgr = nullptr;
    }
    g_teknic_node = nullptr;
    return -100;
  }
}

__declspec(dllexport) void __cdecl teknic_shutdown(void) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  if (!g_teknic_initialized || !g_teknic_mgr || !g_teknic_node) {
    g_teknic_node = nullptr;
    g_teknic_initialized = false;
    g_teknic_motion_enabled = false;
    return;
  }

  try {
    if (g_teknic_motion_enabled) {
      g_teknic_node->Motion.MoveVelStart(0);
      g_teknic_commanded_rpm = 0;
      g_teknic_node->EnableReq(false);
    }
    g_teknic_mgr->PortsClose();
  } catch (...) {
  }

  g_teknic_node = nullptr;
  g_teknic_mgr = nullptr;
  g_teknic_initialized = false;
  g_teknic_motion_enabled = false;
  g_teknic_detail.clear();
}

__declspec(dllexport) int __cdecl teknic_set_velocity_rpm(double rpm) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  if (!g_teknic_initialized || !g_teknic_node) {
    return -1;
  }
  if (!g_teknic_motion_enabled) {
    g_teknic_detail =
        "Info-only link (TeknicCfg::kEnableReqOnConnect=0); motor data only — set kEnableReqOnConnect=1 "
        "to enable jog.";
    return -12;
  }

  const int vel_limit = TeknicCfg::kJogVelLimitRpm;

  try {
    if (!g_teknic_node->Motion.IsReady()) {
      return -5;
    }

    try {
      g_teknic_node->VelUnit(INode::RPM);
    } catch (mnErr&) {
    }

    int cmd = teknic_clamp_rpm_int(rpm, vel_limit);

    g_teknic_node->Motion.MoveVelStart(cmd);
    g_teknic_commanded_rpm = static_cast<double>(cmd);

    return 0;
  } catch (mnErr& theErr) {
    char buf[384];
    snprintf(buf, sizeof(buf), "Move mnErr 0x%08x: %s", theErr.ErrorCode, theErr.ErrorMsg);
    g_teknic_detail = buf;
    return -100;
  }
}

__declspec(dllexport) int __cdecl teknic_stop(void) {
  return teknic_set_velocity_rpm(0.0);
}

__declspec(dllexport) double __cdecl teknic_get_commanded_rpm(void) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  return g_teknic_commanded_rpm;
}

__declspec(dllexport) int __cdecl teknic_is_connected(void) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  return g_teknic_initialized ? 1 : 0;
}

__declspec(dllexport) const char* __cdecl teknic_get_detail(void) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  return g_teknic_detail.c_str();
}

/**
 * Writes UTF-8 JSON from IInfo (same source as SCNetworkReport-style scan).
 * Returns JSON byte length (excluding '\0'), or -1 not connected, -2 runtime error,
 * -3 bad args, -4 buffer too small.
 */
__declspec(dllexport) int __cdecl teknic_get_motor_info_json(char* out, int cap) {
  std::lock_guard<std::recursive_mutex> lock(g_teknic_mu);
  if (!out || cap < 64) {
    return -3;
  }
  out[0] = '\0';
  if (!g_teknic_initialized || !g_teknic_node) {
    return -1;
  }
  try {
    std::string j = teknic_motor_info_json(*g_teknic_node);
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
