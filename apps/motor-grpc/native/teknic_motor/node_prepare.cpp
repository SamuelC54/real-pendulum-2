#include "node_prepare.h"

#include <algorithm>
#include <cstdio>

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
    teknic_sleep_ms(TeknicCfg::kPreEnableDisableGapMs);
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
        g_teknic_detail = stage;
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
      if (!g_teknic_detail.empty()) {
        g_teknic_detail += " ";
      }
      if (TeknicCfg::kHostVelocityParamsBeforeEnable != 0) {
        g_teknic_detail +=
            "Hint: adjust TeknicCfg::kAccLimitRpmPerSec or MSP/ClearView toward factory defaults "
            "for MotionVelocity-style host velocity.";
      } else {
        g_teknic_detail +=
            "Hint: host VelUnit/AccLimit were not applied (kHostVelocityParamsBeforeEnable=0); "
            "adjust motion limits in MSP/ClearView or set kHostVelocityParamsBeforeEnable=1 if allowed.";
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
