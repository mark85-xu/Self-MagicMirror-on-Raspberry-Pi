#!/usr/bin/env python3
"""On-demand, durable Raspberry Pi system anomaly recorder."""

from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time
from typing import Any


SAMPLE_INTERVAL_SECONDS = 5
RETENTION_DAYS = 14
STATE_DIR = Path.home() / ".local/state/pi-anomaly-recorder"
RELEVANT_KERNEL = re.compile(
    r"under.?voltage|voltage|throttl|thermal|temperature|oom|out of memory|"
    r"__vm_enough_memory|not enough memory for the allocation|"
    r"killed process|watchdog|kernel panic|panic|mmc.*(?:error|timeout)|"
    r"i/o error|filesystem|ext4.*error",
    re.IGNORECASE,
)
RELEVANT_PROCESSES = re.compile(
    r"^(?:scim|electron|node|whisper|whisper-cli|piper|arecord|aplay|alsa)(?:$|[-_])",
    re.IGNORECASE,
)
STOP_TYPES = {"recording_stopped", "previous_recording_interrupted"}
stop_requested = threading.Event()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None


def uptime_seconds() -> float | None:
    uptime = read_text(Path("/proc/uptime"))
    if uptime:
        try:
            return float(uptime.split()[0])
        except (ValueError, IndexError):
            pass
    return None


def run_command(args: list[str], timeout: float = 2.0) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, "", type(exc).__name__


def parse_throttle(raw: str) -> dict[str, Any]:
    match = re.search(r"0x[0-9a-fA-F]+", raw)
    if not match:
        raise ValueError("vcgencmd returned an unrecognized throttling value")
    value = int(match.group(0), 16)
    flags = {
        "undervoltage_now": 0,
        "frequency_capped_now": 1,
        "throttled_now": 2,
        "soft_temperature_limit_now": 3,
        "undervoltage_occurred": 16,
        "frequency_capped_occurred": 17,
        "throttling_occurred": 18,
        "soft_temperature_limit_occurred": 19,
    }
    return {"raw": f"0x{value:x}", **{name: bool(value & (1 << bit)) for name, bit in flags.items()}}


def memory_metrics() -> dict[str, int]:
    values: dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
            key, value = line.split(":", 1)
            if key in {"MemTotal", "MemAvailable", "SwapTotal", "SwapFree", "CommitLimit", "Committed_AS"}:
                values[key.lower() + "_kb"] = int(value.strip().split()[0])
    except (OSError, ValueError, IndexError):
        pass
    for key, path in {
        "vm_overcommit_memory": Path("/proc/sys/vm/overcommit_memory"),
        "vm_overcommit_ratio": Path("/proc/sys/vm/overcommit_ratio"),
    }.items():
        value = read_text(path)
        if value:
            try:
                values[key] = int(value)
            except ValueError:
                pass
    return values


def process_metrics() -> list[dict[str, Any]]:
    code, output, error = run_command(["ps", "-eo", "pid=,comm=,%cpu=,%mem=,rss="], timeout=3.0)
    if code != 0:
        raise RuntimeError(f"ps unavailable: {error or code}")
    result: list[dict[str, Any]] = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) != 5:
            continue
        pid, name, cpu, mem, rss = fields
        if RELEVANT_PROCESSES.search(name):
            try:
                result.append({"pid": int(pid), "name": name, "cpu_percent": float(cpu), "memory_percent": float(mem), "rss_kb": int(rss)})
            except ValueError:
                continue
    return result


def sample_metrics(boot_id: str) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "type": "sample",
        "timestamp": utc_now(),
        "boot_id": boot_id,
    }
    uptime = uptime_seconds()
    if uptime is not None:
        metrics["uptime_seconds"] = uptime
    load = read_text(Path("/proc/loadavg"))
    if load:
        try:
            metrics["load_average"] = [float(item) for item in load.split()[:3]]
        except ValueError:
            pass
    metrics["memory"] = memory_metrics()

    temperature = read_text(Path("/sys/class/thermal/thermal_zone0/temp"))
    if temperature:
        try:
            metrics["cpu_temperature_c"] = int(temperature) / 1000.0
        except ValueError:
            pass
    frequency = read_text(Path("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"))
    if frequency:
        try:
            metrics["cpu_frequency_mhz"] = int(frequency) / 1000.0
        except ValueError:
            pass

    code, output, error = run_command(["vcgencmd", "get_throttled"])
    if code == 0:
        try:
            metrics["throttling"] = parse_throttle(output)
        except ValueError as exc:
            metrics["errors"] = [str(exc)]
    else:
        metrics["errors"] = [f"vcgencmd get_throttled unavailable: {error or code}"]
    try:
        metrics["processes"] = process_metrics()
    except RuntimeError as exc:
        metrics.setdefault("errors", []).append(str(exc))
    return metrics


def fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class JsonlWriter:
    def __init__(self, path: Path):
        self.path = path
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        os.fchmod(descriptor, 0o600)
        self.file = os.fdopen(descriptor, "a", encoding="utf-8", buffering=1)
        self.lock = threading.Lock()

    def write(self, record: dict[str, Any]) -> None:
        with self.lock:
            self.file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            self.file.flush()
            os.fsync(self.file.fileno())

    def close(self) -> None:
        self.file.close()


def parse_existing_types(path: Path) -> set[str]:
    types: set[str] = set()
    try:
        with path.open("rb+") as file:
            data = file.read()
            last_newline = data.rfind(b"\n")
            if data and last_newline != len(data) - 1:
                file.seek(last_newline + 1)
                file.truncate()
                file.flush()
                os.fsync(file.fileno())
                data = data[: last_newline + 1]
            for line in data.splitlines():
                try:
                    record = json.loads(line)
                    if isinstance(record, dict) and isinstance(record.get("type"), str):
                        types.add(record["type"])
                except (json.JSONDecodeError, UnicodeDecodeError):
                    continue
    except OSError:
        return set()
    return types


def recover_previous_recording(current_path: Path, boot_id: str) -> None:
    recordings = sorted(STATE_DIR.glob("recording-*.jsonl"), key=lambda item: item.stat().st_mtime, reverse=True)
    previous = next((path for path in recordings if path != current_path), None)
    if previous is None:
        return
    existing_types = parse_existing_types(previous)
    if existing_types & STOP_TYPES:
        return
    with previous.open("a", encoding="utf-8") as file:
        file.write(json.dumps({
            "type": "previous_recording_interrupted",
            "timestamp": utc_now(),
            "boot_id": boot_id,
            "recovered_by": str(os.getpid()),
        }, separators=(",", ":")) + "\n")
        file.flush()
        os.fsync(file.fileno())


def rotate_logs(current_path: Path) -> None:
    cutoff = time.time() - RETENTION_DAYS * 24 * 60 * 60
    removed = False
    for path in STATE_DIR.glob("recording-*.jsonl"):
        if path == current_path:
            continue
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed = True
        except OSError:
            continue
    if removed:
        fsync_directory(STATE_DIR)


def kernel_reader_command() -> tuple[list[str] | None, str | None]:
    options = ["--level=emerg,alert,crit,err,warn"]
    candidates = [
        ["dmesg", "--follow-new", "--time-format", "iso", *options],
        ["journalctl", "-kf", "-o", "short-iso-precise", "--no-pager"],
    ]
    for command in candidates:
        try:
            probe = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=0.5, text=True)
            if probe.returncode == 0 or probe.returncode == -signal.SIGTERM:
                return command, None
        except subprocess.TimeoutExpired:
            return command, None
        except OSError:
            continue
    return None, "Neither dmesg --follow-new nor journalctl kernel following is available"


def start_kernel_reader(writer: JsonlWriter, boot_id: str) -> tuple[subprocess.Popen[str] | None, threading.Thread | None]:
    recent_commands = [
        ["dmesg", "--time-format", "iso", "--level=emerg,alert,crit,err,warn"],
        ["journalctl", "-k", "-b", "-p", "warning..emerg", "--no-pager", "-o", "short-iso-precise"],
    ]
    for recent_command in recent_commands:
        code, output, _error = run_command(recent_command, timeout=4.0)
        if code == 0:
            relevant_lines = [line.strip() for line in output.splitlines() if RELEVANT_KERNEL.search(line)]
            for message in relevant_lines[-100:]:
                writer.write({"type": "kernel_warning", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "source": "recent", "message": message[:2000]})
            break
    command, error = kernel_reader_command()
    if command is None:
        writer.write({"type": "kernel_reader_error", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "error": error})
        return None, None
    writer.write({"type": "kernel_reader_started", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "reader": Path(command[0]).name})
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    except OSError as exc:
        writer.write({"type": "kernel_reader_error", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "error": type(exc).__name__})
        return None, None

    def consume() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            message = line.strip()
            if message and RELEVANT_KERNEL.search(message):
                writer.write({"type": "kernel_warning", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "message": message[:2000]})
        if not stop_requested.is_set() and process.poll() is not None:
            writer.write({"type": "kernel_reader_error", "timestamp": utc_now(), "boot_id": boot_id, "uptime_seconds": uptime_seconds(), "exit_code": process.returncode})

    thread = threading.Thread(target=consume, name="kernel-log-reader", daemon=True)
    thread.start()
    return process, thread


def install_signal_handlers() -> None:
    def request_stop(_signum: int, _frame: Any) -> None:
        stop_requested.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)


def main() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(STATE_DIR, 0o700)
    lock_path = STATE_DIR / "recorder.lock"
    lock_file = lock_path.open("a+")
    os.chmod(lock_path, 0o600)
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("An anomaly recorder is already running.", file=sys.stderr)
        return 2

    boot_id = read_text(Path("/proc/sys/kernel/random/boot_id")) or "unknown"
    started = dt.datetime.now(dt.timezone.utc)
    log_path = STATE_DIR / f"recording-{started.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}.jsonl"
    writer = JsonlWriter(log_path)
    fsync_directory(STATE_DIR)
    recover_previous_recording(log_path, boot_id)
    rotate_logs(log_path)
    install_signal_handlers()
    print(f"Recording to {log_path}", flush=True)

    kernel_process: subprocess.Popen[str] | None = None
    kernel_thread: threading.Thread | None = None
    had_error = False
    try:
        writer.write({"type": "recording_started", "timestamp": utc_now(), "boot_id": boot_id, "sample_interval_seconds": SAMPLE_INTERVAL_SECONDS})
        kernel_process, kernel_thread = start_kernel_reader(writer, boot_id)
        while not stop_requested.is_set():
            record = sample_metrics(boot_id)
            writer.write(record)
            print(f"{record['timestamp']} sample saved", flush=True)
            stop_requested.wait(SAMPLE_INTERVAL_SECONDS)
    except Exception as exc:
        had_error = True
        writer.write({"type": "recorder_error", "timestamp": utc_now(), "boot_id": boot_id, "error": type(exc).__name__})
        print(f"Recorder stopped after {type(exc).__name__}; see the log.", file=sys.stderr, flush=True)
        return 1
    finally:
        if kernel_process is not None and kernel_process.poll() is None:
            kernel_process.terminate()
            try:
                kernel_process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                kernel_process.kill()
        if kernel_thread is not None:
            kernel_thread.join(timeout=2)
        if not had_error and stop_requested.is_set():
            writer.write({"type": "recording_stopped", "timestamp": utc_now(), "boot_id": boot_id, "reason": "signal"})
        writer.close()
        lock_file.close()
    print("Recording stopped; all written records were synchronized to storage.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
