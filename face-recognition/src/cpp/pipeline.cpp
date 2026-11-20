#include "face/pipeline.hpp"

#include <iomanip>
#include <iostream>
#include <opencv2/imgproc.hpp>

namespace face {

Pipeline::Pipeline(const Options& options)
    : detector_(options.detector, options.threads, options.confidence, options.iou),
      recognizer_(options.recognizer, options.min_face_size),
      gallery_(options.vectors),
      threshold_(options.threshold) {
  std::cout << "NCNN CPU + SFace, threads=" << options.threads
            << ", gallery samples=" << gallery_.size() << ", threshold=" << threshold_ << '\n';
}

std::vector<Result> Pipeline::process(const cv::Mat& image) {
  std::vector<Result> results;
  for (const auto& detection : detector_.detect(image)) {
    const auto feature = recognizer_.extract(image, detection);
    if (feature) results.push_back({detection, *feature, gallery_.match(*feature, threshold_)});
  }
  return results;
}

cv::Mat annotate(const cv::Mat& image, const std::vector<Result>& results, double fps) {
  cv::Mat output = image.clone();
  for (const auto& result : results) {
    const auto color =
        result.match.name == "Unknown" ? cv::Scalar(0, 100, 255) : cv::Scalar(0, 200, 0);
    cv::rectangle(output, result.detection.box, color, 2);
    for (const auto& point : result.detection.landmarks) {
      cv::circle(output, point, 2, cv::Scalar(255, 180, 0), -1);
    }
    const auto label = result.match.name + " " + cv::format("%.3f", result.match.score);
    cv::putText(output, label,
                {std::max(0, cvRound(result.detection.box.x)),
                 std::max(18, cvRound(result.detection.box.y) - 8)},
                cv::FONT_HERSHEY_SIMPLEX, 0.6, color, 2);
  }
  if (fps > 0) {
    cv::putText(output, cv::format("C++ NCNN %.1f FPS", fps), {10, 25}, cv::FONT_HERSHEY_SIMPLEX,
                0.6, cv::Scalar(0, 255, 255), 2);
  }
  return output;
}

void print_results(const std::string& label, const std::vector<Result>& results) {
  std::cout << label << ':';
  if (results.empty()) std::cout << " No usable faces";
  for (const auto& result : results) {
    std::cout << ' ' << result.match.name << " (" << std::fixed << std::setprecision(3)
              << result.match.score << ')';
  }
  std::cout << '\n';
}

}  // namespace face
