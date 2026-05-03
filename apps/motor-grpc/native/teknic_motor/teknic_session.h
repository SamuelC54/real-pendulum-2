#pragma once

#include <mutex>
#include <string>

namespace sFnd {
class INode;
class SysManager;
}  // namespace sFnd

extern std::recursive_mutex g_teknic_mu;
extern sFnd::SysManager* g_teknic_mgr;
extern sFnd::INode* g_teknic_node;
extern double g_teknic_commanded_rpm;
extern bool g_teknic_initialized;
extern bool g_teknic_motion_enabled;
extern std::string g_teknic_detail;

void teknic_detail_set_from_node(sFnd::INode& node);
