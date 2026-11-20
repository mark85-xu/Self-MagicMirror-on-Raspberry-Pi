# MagicMirror dashboard

[中文说明](README_CN.md) · [Pi deployment](docs/raspberry-pi-deployment.md) · [Development](docs/project-development.md) · [Module index](modules/README.md)

This directory contains the smart mirror dashboard, based on MagicMirror² **2.33.0**. Node helpers provide local files, API requests, speech and face-recognition process management; Electron or a browser displays the interface.

## Deploy and launch on the Pi

Start with the [complete deployment guide](docs/raspberry-pi-deployment.md): prepare the desktop OS, transfer the complete project, install Node and dependencies, then configure modules and models. Use `~/smart-mirror/MagicMirror/` with a sibling `face-recognition/` directory and speech tools under `~/smart-mirror/voice/`.

From a Pi desktop terminal:

```bash
cd "$HOME/smart-mirror/MagicMirror"
npm run config:check
npm run start:wayland
```

Use `npm run start:x11` for X11. These commands select Node from `PATH`. The convenience `scripts/run-face-pi.sh` selects a desktop session and uses `/usr/bin/node`; that interpreter must satisfy Node ≥22.18.0. Press `Ctrl+C` to stop.

Install npm dependencies on the Pi with `npm ci`; the deployment guide includes Git initialization for source archives because package installation uses Git hooks. Transfer custom modules and `css/custom.css`, then enable services one at a time using the guide's initial configuration.

## Configuration

| Path                                    | Purpose                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `config/config.js`                      | Active device configuration, module entries, port and access settings |
| `config/config.js.sample`               | Upstream starting configuration                                       |
| `config/config.face-local.js`           | Local overrides derived from the active configuration                 |
| `config/config.face-local.generated.js` | Serialized local browser configuration                                |
| `css/custom.css`                        | Project theme, layout and module styling                              |
| `modules/MMM-AIChat/.env`               | Local DeepSeek API key                                                |
| `~/.config/magicmirror/weather.json`    | Weather location and server-side credentials                          |

The seven custom modules are AIChat, FaceRecognition, MusicPlayer, WeatherCard, PiStatus, PoemDisplay and QuoteDisplay. Eight upstream default modules provide alerts, clocks, calendars, news, weather, compliments, static text and update notifications. Each has its own README with configuration examples.

The active layout places music at the top center, weather on the left, system status at the bottom right and calendar at the bottom left. AI and face-recognition cards use viewport positioning in their CSS. Poetry is disabled in the current device configuration.

## Face and voice deployment

Prepare Python registration and model files using [Pi Python/CSI setup](../face-recognition/docs/raspberry-pi.md), then build the [C++ runtime](../face-recognition/docs/cpp-deployment.md) on the Pi. Configure the mirror with `runtime: "cpp"`, `source: "picamera2"` and the actual `projectRoot`.

Run `VOICE_ROOT="$HOME/smart-mirror/voice" bash modules/MMM-AIChat/scripts/setup-voice.sh` to build/install speech components. Copy the printed executable and model paths into [MMM-AIChat's](modules/MMM-AIChat/README.md) `voiceChat` options.

Check camera capture, transcription and TTS separately. Stop standalone capture before starting the mirror, then check embedded previews, greetings and music coordination. Voice uses the Pi's ALSA devices; browser music plays on the browser host.

## Development

See the [development guide](docs/project-development.md) for source responsibilities, focused checks and Pi updates. Reload frontend/style changes, restart helper changes, and rebuild native changes on the Pi.

Use `npm run server` for browser debugging, or `npm run start:wayland:dev` / `start:x11:dev` for Electron. For recorded-video development, run `FACE_LOCAL_SOURCE=/path/to/video.mp4 ./scripts/run-face-local.sh` and open `http://localhost:8082`.

```bash
npm run config:check
npm run test:unit -- --runInBand
npm test --prefix modules/MMM-AIChat
```

Core scripts also provide `test:js`, `test:css`, `test:markdown`, `test:e2e` and `test:electron`. Read [DEVELOPMENT.md](DEVELOPMENT.md) for the upstream development workflow. Custom module READMEs list focused test commands.

Custom module implementations, styles, configuration templates and inference models are versioned. Active device configuration, secrets, photos, personal vectors, dependencies and build products remain local.

## Upstream project

MagicMirror² was created by Michael Teeuw and is maintained by the MagicMirror community. Core code is distributed under the [MIT license](LICENSE.md).

- [MagicMirror² repository](https://github.com/MagicMirrorOrg/MagicMirror)
- [Upstream documentation](https://docs.magicmirror.builders)
- [Community forum](https://forum.magicmirror.builders)
- [Changelog](CHANGELOG.md)
- [Collaboration guidelines](Collaboration.md)
