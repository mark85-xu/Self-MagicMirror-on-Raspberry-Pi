cmake_minimum_required(VERSION 3.20)
project(face_recognizer_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(ncnn 1.0 REQUIRED CONFIG)
find_package(OpenCV 4.5 REQUIRED COMPONENTS core imgproc imgcodecs dnn objdetect highgui videoio)
find_package(yaml-cpp REQUIRED)
find_package(PkgConfig REQUIRED)
find_package(Threads REQUIRED)
pkg_check_modules(LIBCAMERA REQUIRED IMPORTED_TARGET libcamera)
pkg_check_modules(LIBZIP REQUIRED IMPORTED_TARGET libzip)

add_library(face_core detector.cpp recognizer.cpp gallery.cpp pipeline.cpp)
target_include_directories(face_core PUBLIC include ${OpenCV_INCLUDE_DIRS})
target_link_libraries(face_core PUBLIC ncnn ${OpenCV_LIBS} yaml-cpp PkgConfig::LIBZIP)
target_compile_options(face_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(face_recognizer main.cpp options.cpp camera.cpp)
target_link_libraries(face_recognizer PRIVATE face_core PkgConfig::LIBCAMERA Threads::Threads)
target_compile_options(face_recognizer PRIVATE -Wall -Wextra -Wpedantic)

install(TARGETS face_recognizer RUNTIME DESTINATION bin)
