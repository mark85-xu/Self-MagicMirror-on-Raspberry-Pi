#include "face/detector.hpp"

#include <yaml-cpp/yaml.h>

#include <algorithm>
#include <cmath>
#include <opencv2/dnn.hpp>
#include <opencv2/imgproc.hpp>
#include <stdexcept>

namespace face {

Detector::Detector(const std::filesystem::path& directory, int threads, float confidence, float iou)
    : confidence_(confidence), iou_(iou) {
  const auto metadata = YAML::LoadFile((directory / "metadata.yaml").string());
  if (metadata["task"].as<std::string>() != "pose" ||
      metadata["kpt_shape"].as<std::vector<int>>() != std::vector<int>{5, 2} ||
      metadata["end2end"].as<bool>(false) || metadata["names"].size() != 1 ||
      metadata["batch"].as<int>() != 1) {
    throw std::runtime_error("Expected a single-class, raw-output five-point NCNN pose model");
  }
  const auto size = metadata["imgsz"].as<std::vector<int>>();
  if (size.size() != 2 || size[0] <= 0 || size[1] <= 0) {
    throw std::runtime_error("Invalid NCNN input size");
  }
  height_ = size[0];
  width_ = size[1];
  net_.opt.num_threads = threads;
  net_.opt.use_vulkan_compute = false;
  net_.opt.use_fp16_packed = true;
  net_.opt.use_fp16_storage = true;
  net_.opt.use_fp16_arithmetic = true;
  net_.opt.blob_allocator = &blobs_;
  net_.opt.workspace_allocator = &workspace_;
  if (net_.load_param((directory / "model.ncnn.param").c_str()) != 0 ||
      net_.load_model((directory / "model.ncnn.bin").c_str()) != 0) {
    throw std::runtime_error("Cannot load NCNN model: " + directory.string());
  }
}

std::vector<Detection> Detector::detect(const cv::Mat& bgr) {
  if (bgr.empty() || bgr.type() != CV_8UC3) {
    throw std::runtime_error("Detector requires a nonempty BGR image");
  }
  const float gain =
      std::min(static_cast<float>(width_) / bgr.cols, static_cast<float>(height_) / bgr.rows);
  const int resized_width = cvRound(bgr.cols * gain);
  const int resized_height = cvRound(bgr.rows * gain);
  const int left = cvRound((width_ - resized_width) / 2.0 - 0.1);
  const int top = cvRound((height_ - resized_height) / 2.0 - 0.1);
  cv::Mat resized, padded;
  cv::resize(bgr, resized, cv::Size(resized_width, resized_height));
  cv::copyMakeBorder(resized, padded, top, height_ - resized_height - top, left,
                     width_ - resized_width - left, cv::BORDER_CONSTANT, cv::Scalar(114, 114, 114));
  auto input = ncnn::Mat::from_pixels(padded.data, ncnn::Mat::PIXEL_BGR2RGB, width_, height_);
  constexpr float normalization[] = {1.F / 255, 1.F / 255, 1.F / 255};
  input.substract_mean_normalize(nullptr, normalization);
  auto extractor = net_.create_extractor();
  ncnn::Mat output;
  if (extractor.input("in0", input) != 0 || extractor.extract("out0", output) != 0) {
    throw std::runtime_error("NCNN forward failed");
  }
  if (output.dims != 2 || output.h != 15 || output.elempack != 1 ||
      output.elemsize != sizeof(float)) {
    throw std::runtime_error("Expected NCNN output [15, anchors]");
  }
  std::vector<cv::Rect2d> boxes;
  std::vector<float> scores;
  std::vector<int> anchors;
  for (int i = 0; i < output.w; ++i) {
    const float score = output.row(4)[i];
    if (!std::isfinite(score) || score <= confidence_) continue;
    const float x = output.row(0)[i], y = output.row(1)[i];
    const float w = output.row(2)[i], h = output.row(3)[i];
    if (!std::isfinite(x + y + w + h) || w <= 0 || h <= 0) continue;
    boxes.emplace_back(x - w / 2, y - h / 2, w, h);
    scores.push_back(score);
    anchors.push_back(i);
  }
  std::vector<int> keep;
  cv::dnn::NMSBoxes(boxes, scores, confidence_, iou_, keep);
  std::vector<Detection> detections;
  for (const int index : keep) {
    if (detections.size() >= 300) break;
    const auto& box = boxes[index];
    const float x1 =
        std::clamp(static_cast<float>((box.x - left) / gain), 0.F, static_cast<float>(bgr.cols));
    const float y1 =
        std::clamp(static_cast<float>((box.y - top) / gain), 0.F, static_cast<float>(bgr.rows));
    const float x2 = std::clamp(static_cast<float>((box.x + box.width - left) / gain), 0.F,
                                static_cast<float>(bgr.cols));
    const float y2 = std::clamp(static_cast<float>((box.y + box.height - top) / gain), 0.F,
                                static_cast<float>(bgr.rows));
    Detection detection;
    detection.box = {x1, y1, x2 - x1, y2 - y1};
    detection.confidence = scores[index];
    for (int point = 0; point < 5; ++point) {
      const float x = (output.row(5 + point * 2)[anchors[index]] - left) / gain;
      const float y = (output.row(6 + point * 2)[anchors[index]] - top) / gain;
      detection.landmarks[point] = {std::clamp(x, 0.F, static_cast<float>(bgr.cols)),
                                    std::clamp(y, 0.F, static_cast<float>(bgr.rows))};
    }
    detections.push_back(detection);
  }
  return detections;
}

}  // namespace face
