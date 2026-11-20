"""CSI dispatch, frame channel order and camera resource cleanup."""

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np

from face_recognition.utils.capture import PicameraCapture, open_capture


class CaptureTests(unittest.TestCase):
    def test_csi_frame_is_passed_as_bgr_and_camera_released(self):
        camera = MagicMock()
        frame = np.array([[[11, 22, 33]]], dtype=np.uint8)
        camera.capture_array.return_value = frame
        constructor = MagicMock(return_value=camera)
        with patch.dict(sys.modules, {"picamera2": SimpleNamespace(Picamera2=constructor)}):
            capture = open_capture("picamera2:1")
            constructor.assert_called_once_with(camera_num=1)
            configuration = camera.create_video_configuration.call_args.kwargs
            self.assertEqual(configuration["main"]["format"], "RGB888")
            self.assertTrue(configuration["queue"])
            ok, result = capture.read()
            self.assertTrue(ok)
            self.assertIs(result, frame)
            capture.release()
            capture.release()
            camera.stop.assert_called_once()
            camera.close.assert_called_once()
            self.assertFalse(capture.isOpened())

    def test_failed_configuration_closes_camera(self):
        camera = MagicMock()
        camera.configure.side_effect = RuntimeError("Camera unavailable")
        with patch.dict(sys.modules, {"picamera2": SimpleNamespace(Picamera2=lambda **kw: camera)}):
            with self.assertRaisesRegex(ValueError, "Cannot start CSI camera"):
                PicameraCapture()
        camera.close.assert_called_once()
        camera.stop.assert_not_called()

    def test_usb_and_file_inputs_retain_opencv_backend(self):
        with patch("face_recognition.utils.capture.cv2.VideoCapture") as constructor:
            open_capture("0")
            constructor.assert_called_with(0)
            open_capture("video.avi")
            constructor.assert_called_with("video.avi")

    def test_invalid_csi_index_is_rejected(self):
        with self.assertRaises(ValueError):
            open_capture("picamera2:wrong")
