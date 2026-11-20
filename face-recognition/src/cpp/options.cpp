#include "face/options.hpp"

#include <charconv>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

namespace face {
namespace {

int integer(const std::string& value) {
  int result = 0;
  const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), result);
  if (error != std::errc{} || end != value.data() + value.size()) {
    throw std::runtime_error("Invalid integer: " + value);
  }
  return result;
}

float real(const std::string& value) {
  std::size_t consumed = 0;
  const float result = std::stof(value, &consumed);
  if (!std::isfinite(result) || consumed != value.size()) {
    throw std::runtime_error("Invalid number: " + value);
  }
  return result;
}

}  // namespace

Options parse_options(int argc, char** argv) {
  Options options;
  options.root = std::filesystem::current_path();
  bool source_given = false;
  for (int i = 1; i < argc; ++i) {
    const std::string key = argv[i];
    if (key == "--help" || key == "-h") {
      std::cout << "Native CSI/NCNN/SFace face recognition\n"
                   "  --root DIR          Project directory\n"
                   "  --input PATH        Image or recursive image folder\n"
                   "  --source SOURCE     csi[:index], USB index or video (default: csi)\n"
                   "  --detector DIR      NCNN model directory\n"
                   "  --recognizer FILE   SFace ONNX\n"
                   "  --vectors-dir DIR   Existing Python NPZ vector directory\n"
                   "  --output DIR        Annotated image output directory\n"
                   "  --report FILE       Image results/features as JSON for verification\n"
                   "  --threads N         NCNN and OpenCV CPU threads (default: 4)\n"
                   "  --conf F            Detection confidence (default: 0.5)\n"
                   "  --threshold F       Identity cosine threshold (default: 0.5)\n"
                   "  --iou F             Detection NMS IoU (default: 0.7)\n"
                   "  --min-face-size N   Minimum face width/height (default: 40)\n"
                   "  --max-frames N      Camera/video frame limit, 0 unlimited\n"
                   "  --json-events       Flush dashboard JSON events to stdout\n"
                   "  --preview-file FILE Latest annotated JPEG (requires --json-events)\n"
                   "  --show / --no-show  Show window; images default to no window\n";
      std::exit(0);
    }
    if (key == "--show" || key == "--no-show") {
      options.show = key == "--show";
      continue;
    }
    if (key == "--json-events") {
      options.json_events = true;
      continue;
    }
    if (i + 1 >= argc) throw std::runtime_error("Missing value for " + key);
    const std::string value = argv[++i];
    if (key == "--root")
      options.root = value;
    else if (key == "--input")
      options.input = value;
    else if (key == "--source") {
      options.source = value;
      source_given = true;
    } else if (key == "--detector")
      options.detector = value;
    else if (key == "--recognizer")
      options.recognizer = value;
    else if (key == "--vectors-dir")
      options.vectors = value;
    else if (key == "--output")
      options.output = value;
    else if (key == "--report")
      options.report = value;
    else if (key == "--preview-file")
      options.preview = value;
    else if (key == "--threads")
      options.threads = integer(value);
    else if (key == "--max-frames")
      options.max_frames = integer(value);
    else if (key == "--min-face-size")
      options.min_face_size = integer(value);
    else if (key == "--conf")
      options.confidence = real(value);
    else if (key == "--threshold")
      options.threshold = real(value);
    else if (key == "--iou")
      options.iou = real(value);
    else
      throw std::runtime_error("Unknown option: " + key);
  }
  if (options.threads < 1 || options.threads > 64 || options.max_frames < 0 ||
      options.min_face_size < 1 || options.confidence <= 0 || options.confidence > 1 ||
      options.threshold < -1 || options.threshold > 1 || options.iou <= 0 || options.iou > 1) {
    throw std::runtime_error("Invalid thread count, frame limit, size or threshold");
  }
  if (!options.input.empty() && source_given) {
    throw std::runtime_error("Choose --input or --source");
  }
  if (!options.preview.empty() && !options.json_events) {
    throw std::runtime_error("--preview-file requires --json-events");
  }
  if (options.input.empty() && (!options.output.empty() || !options.report.empty())) {
    throw std::runtime_error("--output and --report require image/folder input");
  }
  options.root = std::filesystem::absolute(options.root).lexically_normal();
  const auto resolve = [&](const std::filesystem::path& path) {
    return (path.is_absolute() ? path : options.root / path).lexically_normal();
  };
  options.detector =
      resolve(options.detector.empty() ? "models/yolo26n-face_ncnn_model" : options.detector);
  options.recognizer =
      resolve(options.recognizer.empty() ? "models/face_recognition_sface_2021dec.onnx"
                                         : options.recognizer);
  options.vectors = resolve(options.vectors.empty() ? "face_vectors" : options.vectors);
  if (!options.input.empty()) options.input = resolve(options.input);
  if (!options.output.empty()) options.output = resolve(options.output);
  if (!options.report.empty()) options.report = resolve(options.report);
  if (!options.preview.empty()) options.preview = resolve(options.preview);
  return options;
}

}  // namespace face
