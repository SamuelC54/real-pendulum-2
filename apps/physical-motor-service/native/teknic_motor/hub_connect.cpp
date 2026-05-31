#include "hub_connect.h"

#include <cstdio>
#include <string>
#include <vector>

#include "pubSysCls.h"
#include "teknic_cfg.h"
#include "teknic_session.h"
#include "teknic_util.h"

using namespace sFnd;

int teknic_hub_configure_ports(SysManager* mgr, size_t& ports_to_open, bool& need_shared_ports_open) {
  std::vector<std::string> comHubPorts;
  ports_to_open = 0;
  need_shared_ports_open = true;

#if defined(_WIN32) || defined(_WIN64)
  if (TeknicCfg::kManualComWhenDiscoveryEmpty >= 1) {
    const int comNum = TeknicCfg::kManualComWhenDiscoveryEmpty;
    mgr->ComHubPort(0, comNum);
    ports_to_open = 1;
    char hint[160];
    snprintf(hint, sizeof(hint), "Manual COM%d (TeknicCfg; SCNetworkReport argv path)", comNum);
    g_teknic_detail = hint;
    return 0;
  }
#endif
  {
    for (int attempt = 0; attempt < TeknicCfg::kFindComHubAttempts; ++attempt) {
      if (attempt > 0) {
        teknic_sleep_ms(TeknicCfg::kFindComHubRetryDelayMs);
      }
      SysManager::FindComHubPorts(comHubPorts);
      if (!comHubPorts.empty()) {
        break;
      }
    }

    if (!comHubPorts.empty()) {
      for (size_t port = 0; port < comHubPorts.size(); ++port) {
        mgr->ComHubPort(port, comHubPorts[port].c_str());
      }
      ports_to_open = comHubPorts.size();
      char hint[384];
      snprintf(hint, sizeof(hint), "FindComHubPorts: %zu hub(s), port0 \"%s\"", comHubPorts.size(),
               comHubPorts[0].c_str());
      g_teknic_detail = hint;
      return 0;
    }
#if defined(_WIN32) || defined(_WIN64)
    const int scan_min = TeknicCfg::kComPortScanMin;
    const int scan_max = TeknicCfg::kComPortScanMax;
    int found_com = 0;
    if (scan_min >= 1 && scan_max >= scan_min) {
      for (int com = scan_min; com <= scan_max; ++com) {
        try {
          mgr->ComHubPort(0, com);
          mgr->PortsOpen(1);
          IPort& probe = mgr->Ports(0);
          if (probe.NodeCount() >= 1) {
            found_com = com;
            ports_to_open = 1;
            char hint[224];
            snprintf(hint, sizeof(hint), "COM scan: COM%d (tried COM%d..COM%d)", com, scan_min,
                     scan_max);
            g_teknic_detail = hint;
            need_shared_ports_open = false;
            break;
          }
        } catch (mnErr&) {
        } catch (...) {
        }
        try {
          mgr->PortsClose();
        } catch (...) {
        }
        teknic_sleep_ms(TeknicCfg::kComPortScanFailGapMs);
      }
    }
    if (found_com == 0) {
      g_teknic_detail =
          "No SC4-HUB's found (FindComHubPorts). Set TeknicCfg::kManualComWhenDiscoveryEmpty, or "
          "enable TeknicCfg::kComPortScanMin/kComPortScanMax (e.g. 1..30) to probe COM ports. "
          "Quit ClearView if it holds the COM.";
      return -2;
    }
    return 0;
#else
    g_teknic_detail =
        "No SC4-HUB's found (FindComHubPorts). Ensure SC4-HUB via USB and 24 V, or use a platform "
        "with manual COM / COM scan support.";
    return -2;
#endif
  }
}
