#include "face/camera.hpp"

#include <libcamera/formats.h>
#include <libcamera/libcamera.h>
#include <linux/dma-buf.h>
#include <sys/ioctl.h>
#include <sys/mman.h>

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <map>
#include <mutex>
#include <opencv2/videoio.hpp>
#include <stdexcept>
#include <vector>

namespace face {
namespace {

class CpuReadAccess {
 public:
  explicit CpuReadAccess(int fd) : fd_(fd) {
    dma_buf_sync sync{};
    sync.flags = DMA_BUF_SYNC_START | DMA_BUF_SYNC_READ;
    if (ioctl(fd_, DMA_BUF_IOCTL_SYNC, &sync) < 0) {
      throw std::runtime_error("Cannot synchronize camera DMA buffer for CPU read");
    }
  }
  ~CpuReadAccess() {
    dma_buf_sync sync{};
    sync.flags = DMA_BUF_SYNC_END | DMA_BUF_SYNC_READ;
    ioctl(fd_, DMA_BUF_IOCTL_SYNC, &sync);
  }

 private:
  int fd_;
};

class CsiCamera final : public FrameSource {
 public:
  explicit CsiCamera(std::size_t index) {
    try {
      manager_ = std::make_unique<libcamera::CameraManager>();
      if (manager_->start() < 0) throw std::runtime_error("Cannot start libcamera manager");
      manager_started_ = true;
      if (index >= manager_->cameras().size()) throw std::runtime_error("CSI index not found");
      camera_ = manager_->cameras()[index];
      if (camera_->acquire() < 0) throw std::runtime_error("CSI camera is busy");
      acquired_ = true;
      auto config = camera_->generateConfiguration({libcamera::StreamRole::VideoRecording});
      if (!config || config->empty()) throw std::runtime_error("No camera configuration");
      auto& stream_config = config->at(0);
      // libcamera RGB888 is B,G,R in memory, matching Picamera2/OpenCV.
      stream_config.pixelFormat = libcamera::formats::RGB888;
      stream_config.colorSpace = libcamera::ColorSpace::Smpte170m;
      stream_config.size = {640, 480};
      stream_config.bufferCount = 4;
      if (config->validate() == libcamera::CameraConfiguration::Invalid ||
          stream_config.pixelFormat != libcamera::formats::RGB888 ||
          camera_->configure(config.get()) < 0) {
        throw std::runtime_error("Cannot configure a packed BGR CSI stream");
      }
      width_ = stream_config.size.width;
      height_ = stream_config.size.height;
      stride_ = stream_config.stride;
      stream_ = stream_config.stream();
      allocator_ = std::make_unique<libcamera::FrameBufferAllocator>(camera_);
      if (allocator_->allocate(stream_) < 0)
        throw std::runtime_error("Cannot allocate CSI buffers");
      for (const auto& buffer : allocator_->buffers(stream_)) {
        if (buffer->planes().size() != 1) throw std::runtime_error("Expected one RGB plane");
        const auto& plane = buffer->planes()[0];
        const std::size_t length = plane.offset + plane.length;
        void* address = mmap(nullptr, length, PROT_READ, MAP_SHARED, plane.fd.get(), 0);
        if (address == MAP_FAILED) throw std::runtime_error("Cannot mmap camera buffer");
        mappings_[buffer.get()] = {address, length, plane.offset, plane.fd.get()};
        auto request = camera_->createRequest();
        if (!request || request->addBuffer(stream_, buffer.get()) < 0) {
          throw std::runtime_error("Cannot create camera request");
        }
        requests_.push_back(std::move(request));
      }
      if (requests_.empty()) throw std::runtime_error("No allocated camera requests");
      camera_->requestCompleted.connect(this, &CsiCamera::completed);
      libcamera::ControlList controls(camera_->controls());
      controls.set(libcamera::controls::FrameDurationLimits,
                   {std::int64_t{66666}, std::int64_t{66666}});
      if (camera_->start(&controls) < 0) throw std::runtime_error("Cannot start CSI stream");
      started_ = true;
      running_ = true;
      for (auto& request : requests_) {
        if (camera_->queueRequest(request.get()) < 0) {
          throw std::runtime_error("Cannot queue camera request");
        }
      }
      std::cout << "CSI " << width_ << 'x' << height_ << " BGR, latest-frame capture\n";
    } catch (...) {
      stop();
      throw;
    }
  }

  ~CsiCamera() override { stop(); }

  bool next(cv::Mat& image) override {
    std::unique_lock lock(mutex_);
    if (!available_.wait_for(lock, std::chrono::seconds(3),
                             [this] { return sequence_ != read_sequence_ || !running_; })) {
      throw std::runtime_error("No CSI frame received within 3 seconds");
    }
    if (!running_) throw std::runtime_error("CSI capture stopped: " + error_);
    // The producer publishes a new owned Mat; it never modifies an older one.
    image = latest_;
    read_sequence_ = sequence_;
    return !image.empty();
  }

 private:
  struct Mapping {
    void* address;
    std::size_t length;
    std::size_t offset;
    int fd;
  };

  void completed(libcamera::Request* request) {
    if (!running_ || request->status() == libcamera::Request::RequestCancelled) return;
    try {
      auto* buffer = request->buffers().at(stream_);
      const auto& mapping = mappings_.at(buffer);
      auto* pixels = static_cast<unsigned char*>(mapping.address) + mapping.offset;
      if (mapping.length - mapping.offset < stride_ * height_) {
        throw std::runtime_error("Camera buffer is smaller than its stride/height");
      }
      cv::Mat owned;
      {
        CpuReadAccess access(mapping.fd);
        cv::Mat view(height_, width_, CV_8UC3, pixels, stride_);
        owned = view.clone();
      }
      {
        std::lock_guard lock(mutex_);
        latest_ = std::move(owned);
        ++sequence_;
      }
      available_.notify_one();
      request->reuse(libcamera::Request::ReuseBuffers);
      if (running_ && camera_->queueRequest(request) < 0) {
        throw std::runtime_error("Camera request requeue failed");
      }
    } catch (const std::exception& error) {
      {
        std::lock_guard lock(mutex_);
        error_ = error.what();
        running_ = false;
      }
      available_.notify_all();
    }
  }

  void stop() noexcept {
    running_ = false;
    available_.notify_all();
    if (started_) {
      camera_->stop();
      started_ = false;
    }
    if (camera_) camera_->requestCompleted.disconnect(this);
    requests_.clear();
    for (const auto& [buffer, mapping] : mappings_) {
      munmap(mapping.address, mapping.length);
    }
    mappings_.clear();
    allocator_.reset();
    if (acquired_) {
      camera_->release();
      acquired_ = false;
    }
    camera_.reset();
    if (manager_started_) {
      manager_->stop();
      manager_started_ = false;
    }
  }

  std::unique_ptr<libcamera::CameraManager> manager_;
  std::shared_ptr<libcamera::Camera> camera_;
  std::unique_ptr<libcamera::FrameBufferAllocator> allocator_;
  libcamera::Stream* stream_ = nullptr;
  std::vector<std::unique_ptr<libcamera::Request>> requests_;
  std::map<libcamera::FrameBuffer*, Mapping> mappings_;
  std::mutex mutex_;
  std::condition_variable available_;
  cv::Mat latest_;
  std::uint64_t sequence_ = 0, read_sequence_ = 0;
  unsigned width_ = 0, height_ = 0, stride_ = 0;
  std::atomic<bool> running_ = false;
  bool manager_started_ = false, acquired_ = false, started_ = false;
  std::string error_;
};

class VideoSource final : public FrameSource {
 public:
  explicit VideoSource(const std::string& source) {
    const bool numeric =
        !source.empty() &&
        std::all_of(source.begin(), source.end(), [](unsigned char c) { return std::isdigit(c); });
    if (numeric)
      capture_.open(std::stoi(source));
    else
      capture_.open(source);
    if (!capture_.isOpened()) throw std::runtime_error("Cannot open video source: " + source);
  }
  bool next(cv::Mat& image) override { return capture_.read(image); }

 private:
  cv::VideoCapture capture_;
};

}  // namespace

std::unique_ptr<FrameSource> open_source(const std::string& source) {
  if (source == "csi" || source == "picamera2") return std::make_unique<CsiCamera>(0);
  if (source.rfind("csi:", 0) == 0) {
    const auto index = source.substr(4);
    if (index.empty() || index.find_first_not_of("0123456789") != std::string::npos) {
      throw std::runtime_error("Use csi:<nonnegative camera index>");
    }
    return std::make_unique<CsiCamera>(std::stoull(index));
  }
  return std::make_unique<VideoSource>(source);
}

}  // namespace face
