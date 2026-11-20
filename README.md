# Self MagicMirror on Raspberry Pi

[中文说明](README_CN.md) · [Raspberry Pi deployment](MagicMirror/docs/raspberry-pi-deployment.md) · [Development workflow](MagicMirror/docs/project-development.md) · [Modules](MagicMirror/modules/README.md)

A MagicMirror² 2.33.0 project for **Raspberry Pi 5 with 64-bit Raspberry Pi OS Bookworm Desktop**. It combines a dashboard, AI conversations, local speech, music and YOLO/SFace face recognition. Develop on your workstation, build native components on the Pi, and check the complete system with its camera, microphone, speaker and display. Detailed deployment and module guides are in Chinese.

## Deploy to the Raspberry Pi

Follow the [deployment guide](MagicMirror/docs/raspberry-pi-deployment.md) in this order:

1. Prepare the desktop OS and peripherals; check ARM64 architecture, CSI camera detection and ALSA devices.
2. Clone this repository into `~/smart-mirror/` on the Pi to obtain modules, the theme and inference models. Prepare registration photos and the personal gallery separately.
3. Install Node.js ≥22.18.0, npm dependencies and a Pi system-Python virtual environment. Build platform dependencies on the target device.
4. Create the Pi configuration, check it and start the basic dashboard in the desktop session.
5. Configure weather, the DeepSeek API key, Whisper/Piper, ALSA and the music library; enable modules one at a time.
6. Prepare the face gallery and build the C++ NCNN runtime on the Pi. Check standalone capture, then enable the mirror bridge and spoken greetings.
7. Check display, audio, music coordination and camera release, then configure desktop-session autostart.

After dependencies, configuration and models are prepared, launch from a Pi desktop terminal:

```bash
cd "$HOME/smart-mirror/MagicMirror"
npm run config:check
npm run start:wayland
# For X11, use npm run start:x11
```

Press `Ctrl+C` in the launch terminal to stop. The convenience `run-face-pi.sh` uses `/usr/bin/node`; with a user-local Node installation, use the npm commands above.

## Develop and update

The [development guide](MagicMirror/docs/project-development.md) covers frontend/helper responsibilities, browser and Electron debugging, focused tests, native builds, Pi updates and rollback.

From `MagicMirror/`:

```bash
npm run config:check
npm run test:unit -- --runInBand
npm test --prefix modules/MMM-AIChat
```

For workstation face/greeting development, use a recorded input:

```bash
FACE_LOCAL_SOURCE=/path/to/face-video.mp4 ./scripts/run-face-local.sh
```

Open `http://localhost:8082`. Each [module README](MagicMirror/modules/README.md) includes its Pi setup, source files and checks. Complete camera, audio and display checks on the Pi before updating normal operation.

## Features

| Component       | What it does                                                                              | Guide                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| AI assistant    | DeepSeek conversations, streaming responses, Bing RSS search, voice chat and animated pet | [MMM-AIChat](MagicMirror/modules/MMM-AIChat/README.md)                   |
| Face card       | Annotated camera preview, identity display and one greeting per recognized person per run | [MMM-FaceRecognition](MagicMirror/modules/MMM-FaceRecognition/README.md) |
| Music           | Local MP3 playback, timed LRC lyrics, seeking and volume                                  | [MMM-MusicPlayer](MagicMirror/modules/MMM-MusicPlayer/README.md)         |
| Weather         | Current conditions, seven-day forecast, Open-Meteo with QWeather timeout fallback         | [MMM-WeatherCard](MagicMirror/modules/MMM-WeatherCard/README.md)         |
| System status   | Temperature, power, throttling, frequency, RAM, disk and IP                               | [MMM-PiStatus](MagicMirror/modules/MMM-PiStatus/README.md)               |
| Poetry          | Offline poems with automatic and manual navigation                                        | [MMM-PoemDisplay](MagicMirror/modules/MMM-PoemDisplay/README.md)         |
| Quotes          | Rotating original text, translation and source                                            | [MMM-QuoteDisplay](MagicMirror/modules/MMM-QuoteDisplay/README.md)       |
| Default modules | Clock, calendar, RSS news, alerts, weather and other core modules                         | [Module index](MagicMirror/modules/README.md)                            |

## Project layout

```text
Self-MagicMirror-on-Raspberry-Pi/
├── README.md                    # English project entry
├── README_CN.md                 # Chinese project entry
├── MagicMirror/                 # Dashboard application and Node/Electron runtime
│   ├── config/                  # Device configuration and local preview configuration
│   ├── modules/                 # Seven custom modules and eight default modules
│   ├── css/                     # Core styles and custom dashboard theme
│   ├── assets/                  # Dashboard assets
│   ├── scripts/                 # Local/Pi launchers and anomaly recorder
│   ├── tests/                   # Unit, browser and Electron tests
│   └── docs/                    # Design notes, plans and change records
└── face-recognition/            # Registration and recognition engine
    ├── src/                     # Python package, CLI entries and C++ runtime
    ├── models/                  # YOLO, NCNN and SFace models
    ├── faces/                   # Registration photos
    ├── face_vectors/            # Per-person NPZ vectors and display names
    ├── scripts/                 # Pi build and launch scripts
    ├── docs/                    # Deployment and historical profiling
    └── tests/                   # Python and native integration tests
```

Deployment uses `~/smart-mirror/`, with speech tools in `voice/` and MP3/LRC files in `music_library/`. Replace `/home/pi` in configuration examples with the actual Pi user's directory.

## Documentation

- [Complete Pi deployment](MagicMirror/docs/raspberry-pi-deployment.md)
- [Development, debugging and Pi updates](MagicMirror/docs/project-development.md)
- [Dashboard guide](MagicMirror/README.md) / [中文](MagicMirror/README_CN.md)
- [Module configuration and tests](MagicMirror/modules/README.md)
- [Launchers and diagnostics](MagicMirror/scripts/README.md)
- [Python registration and recognition](face-recognition/README.md)
- [Pi Python/CSI deployment](face-recognition/docs/raspberry-pi.md)
- [Pi C++ builds and historical benchmarks](face-recognition/docs/cpp-deployment.md)

## Credits

The dashboard is based on [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror), distributed under its [MIT license](MagicMirror/LICENSE.md). The external YOLO reference project has its own [license](https://github.com/akanametov/yolo-face/blob/master/LICENSE); recognition models retain their respective licenses. The SFace model attribution is recorded in the recognition guide.
