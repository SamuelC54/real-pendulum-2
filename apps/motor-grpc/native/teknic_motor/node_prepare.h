#pragma once

namespace sFnd {
class INode;
class SysManager;
}

/// Optional velocity limits, NodeStopClear, AlertsClear, EnableReq, IsReady wait.
/// Sets g_teknic_motion_enabled when full enable succeeds. Returns 0, -100, or -4.
int teknic_node_prepare_motion(sFnd::SysManager* mgr, sFnd::INode& myNode);
