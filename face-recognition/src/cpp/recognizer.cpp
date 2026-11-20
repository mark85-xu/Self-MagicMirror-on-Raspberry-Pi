#include "face/recognizer.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace face {

Recognizer::Recognizer(const std::filesystem::path& model, int min_face_size)
    : model_(cv::FaceRecognizerSF::create(model.string(), "")), min_face_size_(min_face_size) {}

std::optional<Feature> Recognizer::extract(const cv::Mat& image, const Detection& detection) {
  if (std::min(detection.box.width, detection.box.height) < min_face_size_ ||
      cv::norm(detection.landmarks[0] - detection.landmarks[1]) < 5) {
    return std::nullopt;
  }
  for (const auto& point : detection.landmarks) {
    if (!std::isfinite(point.x) || !std::isfinite(point.y) || point.x <= 0 || point.y <= 0 ||
        point.x >= image.cols || point.y >= image.rows) {
      return std::nullopt;
    }
  }
  cv::Mat row(1, 15, CV_32F);
  row.at<float>(0, 0) = detection.box.x;
  row.at<float>(0, 1) = detection.box.y;
  row.at<float>(0, 2) = detection.box.width;
  row.at<float>(0, 3) = detection.box.height;
  for (int i = 0; i < 5; ++i) {
    row.at<float>(0, 4 + 2 * i) = detection.landmarks[i].x;
    row.at<float>(0, 5 + 2 * i) = detection.landmarks[i].y;
  }
  row.at<float>(0, 14) = detection.confidence;
  cv::Mat aligned, feature;
  model_->alignCrop(image, row, aligned);
  model_->feature(aligned, feature);
  const double norm = cv::norm(feature);
  if (feature.total() != kFeatureSize || feature.type() != CV_32F || !cv::checkRange(feature) ||
      !std::isfinite(norm) || norm < 1e-8) {
    throw std::runtime_error("SFace returned an invalid embedding");
  }
  Feature result;
  const auto* data = feature.ptr<float>();
  for (int i = 0; i < kFeatureSize; ++i) result[i] = data[i] / norm;
  return result;
}

}  // namespace face
