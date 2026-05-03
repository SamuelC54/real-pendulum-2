#include "teknic_session.h"

#include <cstdio>

#include "pubSysCls.h"

using namespace sFnd;

std::recursive_mutex g_teknic_mu;
SysManager* g_teknic_mgr = nullptr;
INode* g_teknic_node = nullptr;
double g_teknic_commanded_rpm = 0.0;
bool g_teknic_initialized = false;
bool g_teknic_motion_enabled = false;
std::string g_teknic_detail;

void teknic_detail_set_from_node(INode& node) {
  char buf[512];
  snprintf(buf, sizeof(buf), "Teknic node %d | %s | %s", node.Info.Ex.NodeIndex(),
           node.Info.UserID.Value(), node.Info.Model.Value());
  g_teknic_detail = buf;
}
