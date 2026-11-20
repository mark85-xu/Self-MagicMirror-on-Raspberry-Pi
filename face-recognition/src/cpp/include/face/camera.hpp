#pragma once

#include <memory>
#include <opencv2/core.hpp>
#include <string>

namespace face {

class FrameSource {
 public:
  virtual ~FrameSource() = default;
  virtual bool next(cv::Mat& image) = 0;
};

std::unique_ptr<FrameSource> open_source(const std::string& source);

}  // namespace face
