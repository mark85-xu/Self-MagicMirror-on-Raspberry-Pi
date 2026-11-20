#pragma once

#include <filesystem>
#include <opencv2/objdetect/face.hpp>
#include <optional>

#include "face/types.hpp"

namespace face {

class Recognizer {
 public:
  explicit Recognizer(const std::filesystem::path& model, int min_face_size = 40);
  std::optional<Feature> extract(const cv::Mat& image, const Detection& detection);

 private:
  cv::Ptr<cv::FaceRecognizerSF> model_;
  int min_face_size_;
};

}  // namespace face
