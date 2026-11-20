#pragma once

#include <filesystem>
#include <optional>
#include <string>

namespace face {

struct Options {
  std::filesystem::path root, detector, recognizer, vectors, input, output, report, preview;
  std::string source = "csi";
  std::optional<bool> show;
  bool json_events = false;
  int threads = 4, max_frames = 0, min_face_size = 40;
  float confidence = 0.5F, threshold = 0.5F, iou = 0.7F;
};

Options parse_options(int argc, char** argv);

}  // namespace face
