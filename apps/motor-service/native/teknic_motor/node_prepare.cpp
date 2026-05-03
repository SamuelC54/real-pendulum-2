#include "node_prepare.h"

#include <algorithm>
#include <iomanip>
#include <sstream>
#include <string>

#include "pubSysCls.h"
#include "teknic_cfg.h"
#include "teknic_session.h"
#include "teknic_util.h"

using namespace sFnd;

int teknic_node_prepare_motion(SysManager* mgr, INode& myNode) {
  g_teknic_motion_enabled = false;
  if (TeknicCfg::kEnableReqOnConnect == 0) {
    return 0;
  }

  std::string pre_enable_notes;
  const int vel_setup = TeknicCfg::kHostVelocityParamsBeforeEnable;
  // Same order as Teknic MotionVelocity.cpp (AccUnit → AccLimit → VelUnit) before NodeStopClear.
  if (vel_setup >= 1) {
    try {
      myNode.AccUnit(INode::RPM_PER_SEC);
    } catch (mnErr& e) {
      std::ostringstream o;
      o << "AccUnit mnErr 0x" << std::hex << std::uppercase
        << static_cast<unsigned>(e.ErrorCode) << std::nouppercase << std::dec << ": "
        << (e.ErrorMsg ? e.ErrorMsg : "") << "; ";
      pre_enable_notes += o.str();
    }
  }
  if (vel_setup >= 2) {
    try {
      myNode.Motion.AccLimit = TeknicCfg::kAccLimitRpmPerSec;
    } catch (mnErr& e) {
      std::ostringstream o;
      o << "AccLimit=" << TeknicCfg::kAccLimitRpmPerSec << " mnErr 0x" << std::hex
        << std::uppercase << static_cast<unsigned>(e.ErrorCode) << std::nouppercase << std::dec
        << ": " << (e.ErrorMsg ? e.ErrorMsg : "") << "; ";
      pre_enable_notes += o.str();
    }
  }
  if (vel_setup >= 1) {
    try {
      myNode.VelUnit(INode::RPM);
    } catch (mnErr& e) {
      std::ostringstream o;
      o << "VelUnit(RPM) mnErr 0x" << std::hex << std::uppercase
        << static_cast<unsigned>(e.ErrorCode) << std::nouppercase << std::dec << ": "
        << (e.ErrorMsg ? e.ErrorMsg : "") << "; ";
      pre_enable_notes += o.str();
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
    teknic_sleep_ms(TeknicCfg::kPreEnableDisableGapMs);
  }

  {
    const int en_retries = std::max(1, TeknicCfg::kEnableRetries);
    const int en_gap = std::max(0, TeknicCfg::kEnableRetryGapMs);
    bool en_ok = false;
    std::string enable_attempts;
    for (int attempt = 0; attempt < en_retries; attempt++) {
      try {
        myNode.EnableReq(true);
        en_ok = true;
        break;
      } catch (mnErr& e) {
        std::ostringstream o;
        o << "EnableReq attempt " << (attempt + 1) << "/" << en_retries << ": mnErr 0x"
          << std::hex << std::uppercase << static_cast<unsigned>(e.ErrorCode) << std::nouppercase
          << std::dec << " — " << (e.ErrorMsg ? e.ErrorMsg : "(null ErrorMsg)");
        if (!enable_attempts.empty()) {
          enable_attempts += "\n";
        }
        enable_attempts += o.str();
        if (attempt + 1 < en_retries) {
          teknic_sleep_ms(en_gap);
        }
      }
    }
    if (!en_ok) {
      try {
        myNode.EnableReq(false);
      } catch (...) {
      }
      std::ostringstream cfg;
      cfg << "[TeknicCfg compile-time: kEnableReqOnConnect=" << TeknicCfg::kEnableReqOnConnect
          << " kHostVelocityParamsBeforeEnable=" << TeknicCfg::kHostVelocityParamsBeforeEnable
          << " kAccLimitRpmPerSec=" << TeknicCfg::kAccLimitRpmPerSec
          << " kJogVelLimitRpm=" << TeknicCfg::kJogVelLimitRpm << " kPreEnableDisable="
          << TeknicCfg::kPreEnableDisable << " kEnableRetries=" << TeknicCfg::kEnableRetries << "]";
      g_teknic_detail.clear();
      if (!pre_enable_notes.empty()) {
        g_teknic_detail = "Before EnableReq: " + pre_enable_notes + "\n";
      }
      g_teknic_detail += enable_attempts;
      g_teknic_detail += "\n";
      g_teknic_detail += cfg.str();
      g_teknic_detail += "\n";
      if (TeknicCfg::kHostVelocityParamsBeforeEnable >= 2) {
        g_teknic_detail +=
            "Hint: Parameter(62) is usually host AccLimit — set kHostVelocityParamsBeforeEnable=1 "
            "(units only) or 0; tune MSP/kAccLimitRpmPerSec; Access = application channel full.";
      } else if (TeknicCfg::kHostVelocityParamsBeforeEnable == 1) {
        g_teknic_detail +=
            "Hint: AccUnit+VelUnit only (Teknic MotionVelocity order without host AccLimit). If "
            "Parameter(50) persists: MSP motion limits/mode, try kHostVelocityParamsBeforeEnable=2 "
            "(full MotionVelocity), kPreEnableDisable=1, Access channel.";
      } else {
        g_teknic_detail +=
            "Hint: kHostVelocityParamsBeforeEnable=0 — try 1 (VelUnit/AccUnit before enable) if "
            "Parameter(50) at EnableReq; use 2 only if host AccLimit is allowed; align MSP/ClearView.";
      }
      mgr->PortsClose();
      g_teknic_mgr = nullptr;
      return -100;
    }
  }

  double timeout = mgr->TimeStampMsec() + 15000.0;
  while (!myNode.Motion.IsReady()) {
    if (mgr->TimeStampMsec() > timeout) {
      g_teknic_detail = "Timed out waiting for node to enable (Ready).";
      myNode.EnableReq(false);
      mgr->PortsClose();
      g_teknic_mgr = nullptr;
      return -4;
    }
  }
  g_teknic_motion_enabled = true;
  return 0;
}
