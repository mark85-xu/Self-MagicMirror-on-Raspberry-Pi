#pragma once

#include <net.h>

#include <filesystem>
#include <vector>

#include "face/types.hpp"

namespace face {

class Detector {
 public:
  explicit Detector(const std::filesystem::path& directory, int threads = 4,
                    float confidence = 0.5F, float iou = 0.7F);
  std::vector<Detection> detect(const cv::Mat& bgr);

 private:
  // The network must be destroyed before its allocators.
  ncnn::UnlockedPoolAllocator blobs_;
  ncnn::PoolAllocator workspace_;
  ncnn::Net net_;
  int width_ = 640;
  int height_ = 640;
  float confidence_;
  float iou_;
};

}  // namespace face
