#pragma once

#include <algorithm>
#include <chrono>
#include <cmath>
#include <thread>

inline int teknic_clamp_rpm_int(double rpm, int limit) {
  if (!std::isfinite(rpm)) return 0;
  double clamped = std::max(-static_cast<double>(limit), std::min(static_cast<double>(limit), rpm));
  return static_cast<int>(clamped);
}

inline void teknic_sleep_ms(int ms) {
  if (ms > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
  }
}
