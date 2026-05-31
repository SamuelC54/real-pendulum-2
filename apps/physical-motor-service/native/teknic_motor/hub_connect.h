#pragma once

#include <cstddef>

namespace sFnd {
class SysManager;
}

/// Discover/configure COM ports per TeknicCfg (FindComHubPorts, manual COM, COM scan).
/// On success returns 0; sets ports_to_open and whether caller must invoke PortsOpen (when scan left
/// ports closed vs discovery path). On failure returns -2 and sets g_teknic_detail.
int teknic_hub_configure_ports(sFnd::SysManager* mgr, size_t& ports_to_open,
                               bool& need_shared_ports_open);
