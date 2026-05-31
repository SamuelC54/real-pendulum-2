#include "motor_info.h"

#include <sstream>
#include <string>

#include "pubSysCls.h"

using namespace sFnd;

namespace {

std::string json_escape(const char* s) {
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

}  // namespace

std::string teknic_motor_info_json(INode& n) {
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
  o << "{\"nodeIndex\":" << node_index << ",\"nodeTypeCode\":" << node_type_code
    << ",\"nodeTypeLabel\":\"" << json_escape(type_label) << "\",\"userId\":\"" << json_escape(uid)
    << "\",\"firmwareVersion\":\"" << json_escape(fw) << "\",\"serialNumber\":\"" << serial
    << "\",\"model\":\"" << json_escape(model) << "\"}";
  return o.str();
}
