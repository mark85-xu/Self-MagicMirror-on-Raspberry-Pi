#include <algorithm>
#include <cctype>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <opencv2/highgui.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <set>
#include <stdexcept>

#include "face/camera.hpp"
#include "face/options.hpp"
#include "face/pipeline.hpp"

namespace fs = std::filesystem;
namespace {

volatile std::sig_atomic_t running = 1;
constexpr auto kWindow = "C++ NCNN face recognition - Q / Esc to quit";
void interrupt(int) { running = 0; }

bool within(const fs::path& path, const fs::path& directory) {
  if (directory.empty()) return false;
  const auto [a, b] = std::mismatch(path.begin(), path.end(), directory.begin(), directory.end());
  return b == directory.end();
}

bool is_image(const fs::path& path) {
  auto extension = path.extension().string();
  std::transform(extension.begin(), extension.end(), extension.begin(),
                 [](unsigned char c) { return std::tolower(c); });
  static const std::set<std::string> extensions = {".jpg", ".jpeg", ".png",  ".webp",
                                                   ".bmp", ".tif",  ".tiff", ".jfif"};
  return extensions.contains(extension);
}

std::vector<fs::path> collect_images(const face::Options& options) {
  std::vector<fs::path> paths;
  if (fs::is_regular_file(options.input) && is_image(options.input)) {
    paths.push_back(options.input);
  } else if (fs::is_directory(options.input)) {
    if (!options.output.empty() &&
        fs::weakly_canonical(options.input) == fs::weakly_canonical(options.output)) {
      throw std::runtime_error("Input and output directories must differ");
    }
    for (fs::recursive_directory_iterator it(options.input), end; it != end; ++it) {
      if (within(it->path(), options.output)) {
        if (it->is_directory()) it.disable_recursion_pending();
        continue;
      }
      if (it->is_regular_file() && is_image(it->path())) paths.push_back(it->path());
    }
  } else {
    throw std::runtime_error("Input is not a supported image or folder");
  }
  if (paths.empty()) throw std::runtime_error("No supported input images");
  std::sort(paths.begin(), paths.end());
  return paths;
}

bool show(const cv::Mat& image, int delay) {
  cv::imshow(kWindow, image);
  const int key = cv::waitKey(delay) & 0xFF;
  return key != 'q' && key != 27 && cv::getWindowProperty(kWindow, cv::WND_PROP_VISIBLE) >= 1;
}

struct ReportEntry {
  std::string path, error;
  std::vector<face::Result> results;
};

// Only recognition labels/scores cross the dashboard bridge, never embeddings.
class DashboardEvents {
 public:
  explicit DashboardEvents(const face::Options& options) : options_(options) {}

  void emit(int frame, const cv::Mat& image, const std::vector<face::Result>& results) {
    if (!options_.json_events) return;
    bool updated = false;
    const auto now = std::chrono::steady_clock::now();
    if (!options_.preview.empty() &&
        (last_preview_ == std::chrono::steady_clock::time_point{} ||
         now - last_preview_ >= std::chrono::milliseconds(500))) {
      const auto output = face::annotate(image, results);
      cv::Mat preview;
      const double scale = std::min(1.0, 640.0 / output.cols);
      cv::resize(output, preview, {}, scale, scale);
      fs::create_directories(options_.preview.parent_path());
      const auto temporary = options_.preview.parent_path() /
                             (options_.preview.stem().string() + ".tmp.jpg");
      if (!cv::imwrite(temporary.string(), preview, {cv::IMWRITE_JPEG_QUALITY, 75}))
        throw std::runtime_error("Cannot write dashboard preview");
      fs::rename(temporary, options_.preview);
      last_preview_ = now;
      updated = true;
    }
    cv::FileStorage json("", cv::FileStorage::WRITE | cv::FileStorage::MEMORY |
                                cv::FileStorage::FORMAT_JSON);
    json << "type" << "frame" << "frame" << frame << "previewUpdated" << int(updated);
    json << "faces" << "[";
    for (const auto& result : results)
      json << "{" << "name" << result.match.name << "score" << result.match.score << "}";
    json << "]";
    auto line = json.releaseAndGetString();
    line.erase(std::remove(line.begin(), line.end(), '\n'), line.end());
    std::cout << line << std::endl;
  }

 private:
  const face::Options& options_;
  std::chrono::steady_clock::time_point last_preview_{};
};

void write_report(const fs::path& path, const std::vector<ReportEntry>& entries) {
  fs::create_directories(path.parent_path());
  cv::FileStorage report(path.string(), cv::FileStorage::WRITE | cv::FileStorage::FORMAT_JSON);
  if (!report.isOpened()) throw std::runtime_error("Cannot write JSON report");
  report << "images" << "[";
  for (const auto& entry : entries) {
    report << "{" << "path" << entry.path << "error" << entry.error << "faces" << "[";
    for (const auto& result : entry.results) {
      const auto& box = result.detection.box;
      report << "{" << "name" << result.match.name << "score" << result.match.score;
      report << "confidence" << result.detection.confidence;
      report << "box" << std::vector<float>{box.x, box.y, box.x + box.width, box.y + box.height};
      report << "landmarks" << "[";
      for (const auto& point : result.detection.landmarks) {
        report << std::vector<float>{point.x, point.y};
      }
      report << "]" << "feature";
      report << std::vector<float>(result.feature.begin(), result.feature.end());
      report << "}";
    }
    report << "]" << "}";
  }
  report << "]";
}

int run_images(const face::Options& options, face::Pipeline& pipeline, bool display) {
  const auto paths = collect_images(options);
  int processed = 0, errors = 0;
  std::vector<ReportEntry> report;
  DashboardEvents events(options);
  for (const auto& path : paths) {
    if (!running) break;
    cv::Mat annotated;
    try {
      const auto image = cv::imread(path.string());
      if (image.empty()) throw std::runtime_error("Cannot decode image");
      auto results = pipeline.process(image);
      face::print_results(path.string(), results);
      events.emit(processed, image, results);
      if (display || !options.output.empty()) annotated = face::annotate(image, results);
      if (!options.output.empty()) {
        const auto relative =
            fs::is_directory(options.input) ? fs::relative(path, options.input) : path.filename();
        const auto destination = options.output / relative.parent_path() /
                                 (relative.filename().string() + ".recognized.jpg");
        fs::create_directories(destination.parent_path());
        if (!cv::imwrite(destination.string(), annotated)) {
          throw std::runtime_error("Cannot save annotated image");
        }
      }
      if (!options.report.empty()) report.push_back({path.string(), "", std::move(results)});
      ++processed;
    } catch (const std::exception& error) {
      ++errors;
      std::cerr << "SKIP " << path << ": " << error.what() << '\n';
      if (!options.report.empty()) report.push_back({path.string(), error.what(), {}});
      continue;
    }
    if (display && !show(annotated, 0)) break;
  }
  if (!options.report.empty()) write_report(options.report, report);
  std::cout << "Recognition: processed=" << processed << ", skipped=" << errors << '\n';
  return processed > 0 && errors == 0 ? 0 : 1;
}

int run_video(const face::Options& options, face::Pipeline& pipeline, bool display) {
  auto source = face::open_source(options.source);
  const auto started = std::chrono::steady_clock::now();
  int frames = 0, recognized_frames = 0;
  cv::Mat image;
  DashboardEvents events(options);
  while (running && (!options.max_frames || frames < options.max_frames) && source->next(image)) {
    const auto results = pipeline.process(image);
    events.emit(frames, image, results);
    if (std::any_of(results.begin(), results.end(),
                    [](const auto& result) { return result.match.name != "Unknown"; }))
      ++recognized_frames;
    ++frames;
    const double elapsed =
        std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    if (display) {
      if (!show(face::annotate(image, results, frames / elapsed), 1)) break;
    } else if (!options.json_events) {
      face::print_results("frame=" + std::to_string(frames - 1), results);
    }
  }
  const double elapsed =
      std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
  std::cout << "Video: frames=" << frames << ", elapsed=" << elapsed
            << "s, fps=" << (frames ? frames / elapsed : 0)
            << ", recognized_frames=" << recognized_frames << '\n';
  return frames > 0 ? 0 : 1;
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const auto options = face::parse_options(argc, argv);
    const bool display = options.show.value_or(options.input.empty());
    if (display && !std::getenv("DISPLAY")) {
      throw std::runtime_error("DISPLAY is not set; use --no-show over SSH");
    }
    if (display) setenv("QT_QPA_PLATFORM", "xcb", 0);
    cv::setNumThreads(options.threads);
    std::signal(SIGINT, interrupt);
    std::signal(SIGTERM, interrupt);
    face::Pipeline pipeline(options);
    const int result = options.input.empty() ? run_video(options, pipeline, display)
                                             : run_images(options, pipeline, display);
    if (display) cv::destroyAllWindows();
    return result;
  } catch (const std::exception& error) {
    std::cerr << "Error: " << error.what() << '\n';
    return 1;
  }
}
