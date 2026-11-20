#pragma once

#include "face/detector.hpp"
#include "face/gallery.hpp"
#include "face/options.hpp"
#include "face/recognizer.hpp"

namespace face {

class Pipeline {
 public:
  explicit Pipeline(const Options& options);
  std::vector<Result> process(const cv::Mat& image);

 private:
  Detector detector_;
  Recognizer recognizer_;
  Gallery gallery_;
  float threshold_;
};

cv::Mat annotate(const cv::Mat& image, const std::vector<Result>& results, double fps = 0);
void print_results(const std::string& label, const std::vector<Result>& results);

}  // namespace face
