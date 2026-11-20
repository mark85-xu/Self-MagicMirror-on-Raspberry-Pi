#pragma once

#include <array>
#include <opencv2/core.hpp>
#include <string>

namespace face {

inline constexpr int kFeatureSize = 128;
using Feature = std::array<float, kFeatureSize>;

struct Detection {
  cv::Rect2f box;
  std::array<cv::Point2f, 5> landmarks;
  float confidence = 0;
};

struct Match {
  std::string name = "Unknown";
  float score = 0;
};

struct Result {
  Detection detection;
  Feature feature;
  Match match;
};

}  // namespace face
