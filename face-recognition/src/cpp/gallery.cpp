#include "face/gallery.hpp"

#include <zip.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <numeric>
#include <regex>
#include <stdexcept>

namespace face {
namespace {

struct NpyArray {
  std::string dtype;
  std::vector<std::size_t> shape;
  std::vector<unsigned char> bytes;
};

// NumPy's compressed NPZ files use ZIP64 and UTF-32 strings. Read their NPY
// headers explicitly; do not enable pickle or silently reinterpret integer data.
NpyArray read_array(zip_t* archive, const char* name) {
  zip_stat_t info;
  if (zip_stat(archive, name, 0, &info) != 0 || info.size > 64 * 1024 * 1024) {
    throw std::runtime_error(std::string("Missing or oversized NPZ array: ") + name);
  }
  using ZipFile = std::unique_ptr<zip_file_t, decltype(&zip_fclose)>;
  ZipFile file(zip_fopen(archive, name, 0), zip_fclose);
  if (!file) throw std::runtime_error("Cannot open NPZ member");
  std::vector<unsigned char> data(info.size);
  std::size_t read = 0;
  while (read < data.size()) {
    const auto amount = zip_fread(file.get(), data.data() + read, data.size() - read);
    if (amount <= 0) throw std::runtime_error("Truncated NPZ array");
    read += amount;
  }
  if (data.size() < 10 || std::memcmp(data.data(), "\x93NUMPY", 6) != 0) {
    throw std::runtime_error("Invalid NPY magic");
  }
  std::size_t offset = 10;
  std::size_t header_size = data[8] | (static_cast<std::size_t>(data[9]) << 8);
  if (data[6] == 2 || data[6] == 3) {
    if (data.size() < 12) throw std::runtime_error("Truncated NPY header");
    offset = 12;
    header_size |= static_cast<std::size_t>(data[10]) << 16;
    header_size |= static_cast<std::size_t>(data[11]) << 24;
  } else if (data[6] != 1) {
    throw std::runtime_error("Unsupported NPY version");
  }
  if (header_size > data.size() - offset) throw std::runtime_error("Truncated NPY header");
  const std::string header(reinterpret_cast<const char*>(data.data() + offset), header_size);
  std::smatch match;
  const std::regex dtype(R"hdr(['"]descr['"]\s*:\s*['"]([^'"]+)['"])hdr");
  if (!std::regex_search(header, match, dtype)) throw std::runtime_error("Missing NPY dtype");
  NpyArray array;
  array.dtype = match[1].str();
  if (!std::regex_search(header, std::regex(R"(['"]fortran_order['"]\s*:\s*False)"))) {
    throw std::runtime_error("Fortran-order NPY arrays are unsupported");
  }
  if (!std::regex_search(header, match, std::regex(R"(['"]shape['"]\s*:\s*\(([^)]*)\))"))) {
    throw std::runtime_error("Missing NPY shape");
  }
  std::string dimensions = match[1].str();
  if (dimensions.find_first_not_of("0123456789, \t\n\r") != std::string::npos) {
    throw std::runtime_error("Invalid NPY dimensions");
  }
  const std::regex number("[0-9]+");
  for (std::sregex_iterator it(dimensions.begin(), dimensions.end(), number), end; it != end;
       ++it) {
    array.shape.push_back(std::stoull(it->str()));
  }
  array.bytes.assign(data.begin() + offset + header_size, data.end());
  return array;
}

std::string unicode_scalar(const NpyArray& array) {
  if (!array.shape.empty() || array.dtype.rfind("<U", 0) != 0) {
    throw std::runtime_error("Expected a Unicode scalar in NPZ metadata");
  }
  const auto characters = std::stoull(array.dtype.substr(2));
  if (characters > 4096 || array.bytes.size() != characters * 4) {
    throw std::runtime_error("Invalid Unicode scalar length");
  }
  std::string result;
  for (std::size_t i = 0; i < array.bytes.size(); i += 4) {
    const std::uint32_t value = array.bytes[i] | (std::uint32_t(array.bytes[i + 1]) << 8) |
                                (std::uint32_t(array.bytes[i + 2]) << 16) |
                                (std::uint32_t(array.bytes[i + 3]) << 24);
    if (value == 0) break;
    if (value <= 0x7F) {
      result += static_cast<char>(value);
    } else if (value <= 0x7FF) {
      result += static_cast<char>(0xC0 | (value >> 6));
      result += static_cast<char>(0x80 | (value & 0x3F));
    } else if (value <= 0xFFFF && !(value >= 0xD800 && value <= 0xDFFF)) {
      result += static_cast<char>(0xE0 | (value >> 12));
      result += static_cast<char>(0x80 | ((value >> 6) & 0x3F));
      result += static_cast<char>(0x80 | (value & 0x3F));
    } else if (value >= 0x10000 && value <= 0x10FFFF) {
      result += static_cast<char>(0xF0 | (value >> 18));
      result += static_cast<char>(0x80 | ((value >> 12) & 0x3F));
      result += static_cast<char>(0x80 | ((value >> 6) & 0x3F));
      result += static_cast<char>(0x80 | (value & 0x3F));
    } else {
      throw std::runtime_error("Invalid Unicode code point");
    }
  }
  return result;
}

}  // namespace

Gallery::Gallery(const std::filesystem::path& directory) {
  if (!std::filesystem::is_directory(directory)) {
    throw std::runtime_error("Vector directory not found: " + directory.string());
  }
  std::vector<std::filesystem::path> paths;
  for (const auto& entry : std::filesystem::directory_iterator(directory)) {
    if (entry.is_regular_file() && entry.path().extension() == ".npz") {
      paths.push_back(entry.path());
    }
  }
  std::sort(paths.begin(), paths.end());
  for (const auto& path : paths) {
    using Archive = std::unique_ptr<zip_t, decltype(&zip_discard)>;
    Archive archive(zip_open(path.c_str(), ZIP_RDONLY, nullptr), zip_discard);
    if (!archive) throw std::runtime_error("Cannot open vector file: " + path.string());
    const auto name = unicode_scalar(read_array(archive.get(), "name.npy"));
    if (name != path.stem().string() || name.empty() || name == "Unknown" ||
        unicode_scalar(read_array(archive.get(), "model_id.npy")) != "sface-2021dec") {
      throw std::runtime_error("Invalid identity/model metadata in: " + path.string());
    }
    const auto array = read_array(archive.get(), "features.npy");
    if (array.dtype != "<f4" || array.shape.size() != 2 || array.shape[0] == 0 ||
        array.shape[1] != kFeatureSize || array.shape[0] > 100000 ||
        array.bytes.size() != array.shape[0] * kFeatureSize * sizeof(float)) {
      throw std::runtime_error("Expected an N x 128 float32 matrix: " + path.string());
    }
    for (std::size_t row = 0; row < array.shape[0]; ++row) {
      Feature feature;
      std::memcpy(feature.data(), array.bytes.data() + row * sizeof(Feature), sizeof(Feature));
      double norm = 0;
      for (float value : feature) {
        if (!std::isfinite(value)) throw std::runtime_error("Non-finite gallery vector");
        norm += static_cast<double>(value) * value;
      }
      norm = std::sqrt(norm);
      if (norm < 1e-8) throw std::runtime_error("Zero gallery vector");
      for (float& value : feature) value /= norm;
      samples_.push_back({name, feature});
    }
  }
  if (samples_.empty()) throw std::runtime_error("No registered face vectors found");
}

Match Gallery::match(const Feature& feature, float threshold) const {
  Match match;
  float best = -2;
  for (const auto& sample : samples_) {
    const float score =
        std::inner_product(feature.begin(), feature.end(), sample.feature.begin(), 0.F);
    if (score > best) {
      best = score;
      match = {sample.name, std::clamp(score, -1.F, 1.F)};
    }
  }
  if (match.score < threshold) match.name = "Unknown";
  return match;
}

}  // namespace face
