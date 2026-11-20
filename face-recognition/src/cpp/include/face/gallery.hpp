#pragma once

#include <filesystem>
#include <vector>

#include "face/types.hpp"

namespace face {

class Gallery {
 public:
  explicit Gallery(const std::filesystem::path& directory);
  Match match(const Feature& feature, float threshold) const;
  std::size_t size() const { return samples_.size(); }

 private:
  struct Sample {
    std::string name;
    Feature feature;
  };
  std::vector<Sample> samples_;
};

}  // namespace face
