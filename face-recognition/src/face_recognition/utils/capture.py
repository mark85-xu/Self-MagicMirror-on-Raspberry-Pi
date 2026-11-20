"""Frame sources for USB/video inputs and Raspberry Pi CSI cameras."""

import cv2


class PicameraCapture:
    """Expose Picamera2 through the same read/release interface as VideoCapture."""

    def __init__(self, camera_index=0):
        try:
            from picamera2 import Picamera2
        except ImportError as error:
            raise ValueError(
                "Picamera2 is unavailable. On Raspberry Pi use system Python and "
                "a venv created with --system-site-packages; see docs/raspberry-pi.md"
            ) from error
        self.camera = None
        self.started = False
        try:
            self.camera = Picamera2(camera_num=camera_index)
            configuration = self.camera.create_video_configuration(
                # Picamera2 RGB888 arrays contain B,G,R bytes, as OpenCV expects.
                main={"size": (640, 480), "format": "RGB888"},
                # Keep only Picamera2's most recent completed request. Waiting for
                # a new frame after every inference unnecessarily reduces FPS.
                controls={"FrameRate": 15}, buffer_count=2, queue=True,
            )
            self.camera.configure(configuration)
            self.camera.start()
            self.started = True
        except Exception as error:
            self.release()
            raise ValueError(f"Cannot start CSI camera {camera_index}: {error}") from error

    def isOpened(self):
        return self.started

    def read(self):
        if not self.started:
            return False, None
        try:
            return True, self.camera.capture_array("main")
        except RuntimeError as error:
            raise ValueError(f"Cannot capture a CSI frame: {error}") from error

    def release(self):
        camera, self.camera = self.camera, None
        if camera is not None:
            try:
                if self.started:
                    camera.stop()
            finally:
                self.started = False
                camera.close()


def open_capture(source):
    """Use 'picamera2[:index]' for CSI; retain numeric USB and video inputs."""
    value = str(source)
    if value == "picamera2":
        return PicameraCapture()
    if value.startswith("picamera2:"):
        index = value.partition(":")[2]
        if not index.isdecimal():
            raise ValueError("Use picamera2 or picamera2:<nonnegative camera index>")
        return PicameraCapture(int(index))
    return cv2.VideoCapture(int(value) if value.isdecimal() else value)
