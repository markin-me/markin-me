# -*- coding: utf-8 -*-
import base64
import json
import logging
import os
import pathlib
import io
import hashlib
import queue
import re
import socket
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import sys
if os.name == "nt":
    try:
        import winreg
    except Exception:
        winreg = None
else:
    winreg = None
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    import customtkinter as ctk
    import tkinter as tk
    from tkinter import ttk
    from tkinter import messagebox
    UI_BACKEND = "ctk"
except Exception:
    import tkinter as tk
    from tkinter import ttk
    from tkinter import messagebox
    ctk = tk
    UI_BACKEND = "tk"

try:
    import win32con
    import win32print
    import win32ui
    WINDOWS_PRINTING_AVAILABLE = True
    WINDOWS_PRINTING_IMPORT_ERROR = ""
except Exception:
    WINDOWS_PRINTING_AVAILABLE = False
    WINDOWS_PRINTING_IMPORT_ERROR = "pywin32 is not installed for this Python"

try:
    import pypdfium2 as pdfium
    PDFIUM_AVAILABLE = True
except Exception:
    PDFIUM_AVAILABLE = False

try:
    from PIL import Image, ImageWin, ImageDraw, ImageOps
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

PDF_RENDER_AVAILABLE = PDFIUM_AVAILABLE and PIL_AVAILABLE

try:
    import pystray
    PYSTRAY_AVAILABLE = True
except Exception:
    PYSTRAY_AVAILABLE = False

try:
    import ctypes
    WINMM_AVAILABLE = True
except Exception:
    ctypes = None
    WINMM_AVAILABLE = False

APP_NAME = "Print_server"

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
    _local_root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or BASE_DIR
    DATA_DIR = os.path.join(_local_root, APP_NAME)
else:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DATA_DIR = BASE_DIR

os.makedirs(DATA_DIR, exist_ok=True)

CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
CACHE_PATH = os.path.join(DATA_DIR, "printed_cache.json")
LOG_PATH = os.path.join(DATA_DIR, "app.log")
ICON_PATH = os.path.join(BASE_DIR, "icon.ico")


def _resource_path(filename):
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            candidate = os.path.join(meipass, filename)
            if os.path.isfile(candidate):
                return candidate
    candidate = os.path.join(BASE_DIR, filename)
    if os.path.isfile(candidate):
        return candidate
    return ""

DEFAULT_CRM_BASE_URL = os.environ.get("CRM_BASE_URL") or "https://markin-me.ru"


def normalize_crm_base_url(value):
    raw = str(value or "").strip()
    if not raw:
        raw = str(DEFAULT_CRM_BASE_URL or "").strip()
    if not raw:
        raw = "https://markin-me.ru"
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = f"https://{raw.lstrip('/')}"
    return raw.rstrip("/")


def _crm_host_to_ascii(host):
    raw_host = str(host or "").strip().strip(".").lower()
    if not raw_host:
        return ""
    if raw_host == "localhost":
        return raw_host
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", raw_host):
        return raw_host
    if ":" in raw_host and re.match(r"^[0-9a-f:]+$", raw_host):
        return raw_host
    try:
        return raw_host.encode("idna").decode("ascii")
    except Exception:
        return ""


def build_crm_request_url(base_url, suffix=""):
    normalized = normalize_crm_base_url(base_url)
    try:
        parsed = urllib.parse.urlsplit(normalized)
    except Exception:
        return normalized.rstrip("/") + (suffix or "")

    host_ascii = _crm_host_to_ascii(parsed.hostname)
    if host_ascii:
        if ":" in host_ascii and not host_ascii.startswith("["):
            host_ascii = f"[{host_ascii}]"
        auth_prefix = ""
        if parsed.username:
            auth_prefix = urllib.parse.quote(parsed.username, safe="")
            if parsed.password is not None:
                auth_prefix += ":" + urllib.parse.quote(parsed.password, safe="")
            auth_prefix += "@"
        port_suffix = f":{parsed.port}" if parsed.port else ""
        netloc = f"{auth_prefix}{host_ascii}{port_suffix}"
    else:
        netloc = parsed.netloc

    rebuilt = urllib.parse.urlunsplit((
        parsed.scheme or "https",
        netloc,
        parsed.path.rstrip("/"),
        parsed.query,
        parsed.fragment,
    )).rstrip("/")

    if not suffix:
        return rebuilt
    if suffix.startswith("/"):
        return rebuilt + suffix
    return rebuilt + "/" + suffix.lstrip("/")


CRM_BASE_URL = normalize_crm_base_url(DEFAULT_CRM_BASE_URL)


def get_runtime_crm_base_url():
    return CRM_BASE_URL


def set_runtime_crm_base_url(value):
    global CRM_BASE_URL
    CRM_BASE_URL = normalize_crm_base_url(value)
    return CRM_BASE_URL


DEFAULT_CONFIG = {
    "crm_base_url": normalize_crm_base_url(DEFAULT_CRM_BASE_URL),
    "token": "",
    "copies": 1,
    "autostart": False
}


def _safe_float(value, fallback):
    try:
        return float(value)
    except Exception:
        return fallback


def _safe_int(value, fallback):
    try:
        return int(value)
    except Exception:
        return fallback


HTML_JOB_PREFIX = "__HTML_BASE64__:"
META_JOB_PREFIX = "__PRINT_META__:"
BROWSER_TIMEOUT = _safe_float(os.environ.get("PRINT_BROWSER_TIMEOUT"), 25.0)
CRM_HTTP_TIMEOUT = max(3.0, _safe_float(os.environ.get("CRM_HTTP_TIMEOUT"), 15.0))
CRM_FETCH_RETRIES = max(1, _safe_int(os.environ.get("CRM_FETCH_RETRIES"), 2))
CRM_HEARTBEAT_INTERVAL = max(5.0, _safe_float(os.environ.get("CRM_HEARTBEAT_INTERVAL"), 10.0))
CRM_PRINTER_SYNC_INTERVAL = max(3.0, _safe_float(os.environ.get("CRM_PRINTER_SYNC_INTERVAL"), 5.0))
CRM_URL_CHECK_DELAY_MS = max(150, _safe_int(os.environ.get("CRM_URL_CHECK_DELAY_MS"), 150))
CRM_URL_CHECK_TIMEOUT = max(1.0, min(2.0, _safe_float(os.environ.get("CRM_URL_CHECK_TIMEOUT"), 1.5)))
CRM_URL_CHECK_READ_BYTES = max(1024, _safe_int(os.environ.get("CRM_URL_CHECK_READ_BYTES"), 4096))
CRM_URL_BAD_MARKERS = (
    "домен не подключен",
    "domain not connected",
    "502 bad gateway",
    "503 service unavailable",
    "504 gateway timeout",
    "504 gateway time-out",
    "welcome to nginx",
    "apache2 debian default page",
    "site is parked",
    "coming soon",
    "temporarily unavailable",
)

UI_COLORS = {
    "bg": "#1f1f1f",
    "card": "#2a2a2a",
    "text": "#f2f2f2",
    "muted": "#c8c8c8",
    "disabled_text": "#8c8c8c",
    "accent": "#ff8c1a",
    "accent_hover": "#ff9c3a",
    "stop": "#d9534f",
    "stop_hover": "#e46a66",
    "ok": "#3ecf5e",
    "error": "#ff4d4f"
}

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 7788
AGENT_VERSION = "1.0.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler()
    ]
)


def load_config():
    if not os.path.exists(CONFIG_PATH):
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return DEFAULT_CONFIG.copy()
    except Exception:
        return DEFAULT_CONFIG.copy()
    merged = DEFAULT_CONFIG.copy()
    merged.update(data)
    merged["crm_base_url"] = normalize_crm_base_url(merged.get("crm_base_url"))
    return merged


def save_config(data):
    payload = DEFAULT_CONFIG.copy()
    payload.update(data or {})
    payload["crm_base_url"] = normalize_crm_base_url(payload.get("crm_base_url"))
    tmp_path = CONFIG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    os.replace(tmp_path, CONFIG_PATH)


class SoundNotifier:
    def __init__(self, base_url, cache_dir):
        self._base_url = ""
        self._cache_dir = os.path.join(cache_dir, "sound_cache")
        os.makedirs(self._cache_dir, exist_ok=True)
        self._lock = threading.Lock()
        self._alias = "crm_print_push_bot_sound"
        self._play_queue = queue.Queue()
        self._worker = threading.Thread(target=self._playback_loop, daemon=True)
        self._worker.start()
        self.set_base_url(base_url)

    def set_base_url(self, base_url):
        self._base_url = normalize_crm_base_url(base_url)

    def _resolve_sound_url(self, url):
        raw = str(url or "").strip()
        if not raw:
            return ""
        if raw.startswith("http://") or raw.startswith("https://"):
            return raw
        if raw.startswith("/"):
            return f"{self._base_url}{raw}"
        return f"{self._base_url}/{raw}"

    def _download_to_cache(self, sound_url):
        parsed = urllib.parse.urlparse(sound_url)
        ext = os.path.splitext(parsed.path or "")[1] or ".mp3"
        digest = hashlib.sha1(sound_url.encode("utf-8", "ignore")).hexdigest()
        target = os.path.join(self._cache_dir, f"{digest}{ext}")
        if os.path.isfile(target) and os.path.getsize(target) > 0:
            return target
        req = urllib.request.Request(sound_url, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read()
        if not data:
            raise RuntimeError("empty_sound_file")
        tmp = target + ".tmp"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, target)
        return target

    def _play_file_windows(self, file_path):
        if not WINMM_AVAILABLE or ctypes is None:
            return False
        try:
            winmm = ctypes.windll.winmm
            with self._lock:
                winmm.mciSendStringW(f"close {self._alias}", None, 0, None)
                open_cmd = f'open "{file_path}" type mpegvideo alias {self._alias}'
                if winmm.mciSendStringW(open_cmd, None, 0, None) != 0:
                    return False
                if winmm.mciSendStringW(f"play {self._alias} wait", None, 0, None) != 0:
                    return False
                winmm.mciSendStringW(f"close {self._alias}", None, 0, None)
            return True
        except Exception:
            return False

    def _playback_loop(self):
        while True:
            file_path = self._play_queue.get()
            try:
                ok = self._play_file_windows(file_path)
                if not ok:
                    logging.warning("Не удалось воспроизвести звук: %s", file_path)
            except Exception:
                logging.exception("Ошибка воспроизведения звука: %s", file_path)
            finally:
                self._play_queue.task_done()

    def play(self, url):
        resolved = self._resolve_sound_url(url)
        if not resolved:
            return False
        try:
            file_path = self._download_to_cache(resolved)
        except Exception as exc:
            logging.warning("Не удалось загрузить звук %s: %s", resolved, exc)
            return False
        self._play_queue.put(file_path)
        return True


class PrintedCache:
    def __init__(self, path):
        self._path = path
        self._lock = threading.Lock()
        self._data = {
            "version": 1,
            "printed_ids": []
        }
        self._load()

    def _load(self):
        if not os.path.exists(self._path):
            return
        try:
            with open(self._path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict) and data.get("version") == 1:
                printed = data.get("printed_ids")
                if isinstance(printed, list):
                    self._data["printed_ids"] = printed
        except Exception:
            return

    def _save(self):
        tmp_path = self._path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(self._data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self._path)

    def has(self, key):
        if not key:
            return False
        with self._lock:
            return key in self._data.get("printed_ids", [])

    def add(self, key):
        if not key:
            return
        with self._lock:
            printed = self._data.get("printed_ids", [])
            if key in printed:
                return
            printed.append(key)
            # keep cache from growing indefinitely
            if len(printed) > 5000:
                self._data["printed_ids"] = printed[-4000:]
            self._save()


def _get_order_cache_key(order):
    if not isinstance(order, dict):
        return None
    for key in ("public_id", "publicId", "publicID", "publicid"):
        value = order.get(key)
        if value:
            return f"public_id:{value}"
    for key in ("id", "order_id", "orderId", "orderID"):
        value = order.get(key)
        if value:
            return f"id:{value}"
    return None


def _decode_pdf_base64(pdf_base64):
    if not pdf_base64:
        return b""
    if isinstance(pdf_base64, bytes):
        raw = pdf_base64
    else:
        raw = str(pdf_base64)
    if isinstance(raw, str) and "base64," in raw:
        raw = raw.split("base64,", 1)[1]
    if isinstance(raw, str):
        raw = raw.strip()
        return base64.b64decode(raw)
    return base64.b64decode(raw)


def _is_html_job(payload):
    return isinstance(payload, str) and payload.startswith(HTML_JOB_PREFIX)


def _decode_html_job(payload):
    if not _is_html_job(payload):
        return ""
    encoded = payload[len(HTML_JOB_PREFIX) :]
    try:
        html_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise RuntimeError("Неверный HTML payload: " + str(exc))
    try:
        return html_bytes.decode("utf-8")
    except Exception:
        return html_bytes.decode("utf-8", "ignore")


def _is_meta_job(payload):
    return isinstance(payload, str) and payload.startswith(META_JOB_PREFIX)


def _decode_meta_job(payload):
    if not _is_meta_job(payload):
        return {}
    encoded = payload[len(META_JOB_PREFIX) :]
    try:
        meta_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise RuntimeError("Неверный meta payload: " + str(exc))
    try:
        data = json.loads(meta_bytes.decode("utf-8"))
    except Exception:
        data = {}
    return data if isinstance(data, dict) else {}


def _get_printer_state(printer_name):
    if not WINDOWS_PRINTING_AVAILABLE:
        return "", False
    printer_name = str(printer_name or "").strip()
    if not printer_name:
        return "", False

    known_printers = [str(name).strip().lower() for name in _list_printers()]
    if known_printers and printer_name.strip().lower() not in known_printers:
        return printer_name, False

    is_online = True
    try:
        handle = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(handle, 2)
        finally:
            win32print.ClosePrinter(handle)
        status = int(info.get("Status", 0) or 0)
        offline_mask = 0
        for flag_name in (
            "PRINTER_STATUS_OFFLINE",
            "PRINTER_STATUS_ERROR",
            "PRINTER_STATUS_NOT_AVAILABLE",
            "PRINTER_STATUS_NO_TONER",
            "PRINTER_STATUS_PAPER_OUT",
            "PRINTER_STATUS_USER_INTERVENTION",
            "PRINTER_STATUS_PAUSED",
            "PRINTER_STATUS_PENDING_DELETION",
            "PRINTER_STATUS_PAPER_JAM",
            "PRINTER_STATUS_PAPER_PROBLEM",
            "PRINTER_STATUS_OUTPUT_BIN_FULL",
            "PRINTER_STATUS_DOOR_OPEN",
        ):
            offline_mask |= int(getattr(win32print, flag_name, 0) or 0)
        if offline_mask and (status & offline_mask):
            is_online = False
        attributes = int(info.get("Attributes", 0) or 0)
        attr_offline = int(getattr(win32print, "PRINTER_ATTRIBUTE_WORK_OFFLINE", 0) or 0)
        if attr_offline and (attributes & attr_offline):
            is_online = False
    except Exception:
        is_online = False
    return printer_name, is_online


def _get_default_printer_state():
    if not WINDOWS_PRINTING_AVAILABLE:
        return "", False
    try:
        printer_name = str(win32print.GetDefaultPrinter() or "")
    except Exception:
        return "", False
    return _get_printer_state(printer_name)


def _list_printers():
    if not WINDOWS_PRINTING_AVAILABLE:
        return []
    flags = int(getattr(win32print, "PRINTER_ENUM_LOCAL", 0) or 0)
    flags |= int(getattr(win32print, "PRINTER_ENUM_CONNECTIONS", 0) or 0)
    try:
        entries = win32print.EnumPrinters(flags)
    except Exception:
        return []

    names = []
    for item in entries or []:
        name = ""
        if isinstance(item, tuple):
            if len(item) >= 3 and item[2]:
                name = str(item[2])
            elif len(item) >= 2 and item[1]:
                name = str(item[1])
        elif isinstance(item, dict):
            name = str(item.get("pPrinterName") or item.get("printerName") or "")
        if name and name not in names:
            names.append(name)
    return names


def _build_printers_sync_payload():
    default_printer = ""
    if WINDOWS_PRINTING_AVAILABLE:
        try:
            default_printer = str(win32print.GetDefaultPrinter() or "").strip()
        except Exception:
            default_printer = ""

    printers = []
    for name in _list_printers():
        system_name = str(name or "").strip()
        if not system_name:
            continue
        _, printer_online = _get_printer_state(system_name)
        printers.append({
            "system_name": system_name,
            "display_name": system_name,
            "is_default": bool(default_printer and system_name.lower() == default_printer.lower()),
            "status": "online" if printer_online else "offline",
        })
    return {"printers": printers}


def _wrap_text_to_lines(text, max_width):
    words = (text or "").split()
    lines = []
    current = []
    for word in words:
        trial = " ".join(current + [word])
        if len(trial) > max_width and current:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


class _Tooltip:
    def __init__(self, widget, text_getter):
        self.widget = widget
        self.text_getter = text_getter
        self.tip = None
        widget.bind("<Enter>", self._show, add="+")
        widget.bind("<Leave>", self._hide, add="+")
        widget.bind("<ButtonPress>", self._hide, add="+")

    def _show(self, _event=None):
        text = str(self.text_getter() or "").strip()
        if not text or self.tip:
            return
        try:
            x = self.widget.winfo_rootx() + 12
            y = self.widget.winfo_rooty() + self.widget.winfo_height() + 4
            self.tip = tk.Toplevel(self.widget)
            self.tip.wm_overrideredirect(True)
            self.tip.wm_geometry(f"+{x}+{y}")
            label = tk.Label(
                self.tip,
                text=text,
                bg="#222222",
                fg="#ffffff",
                relief="solid",
                borderwidth=1,
                padx=8,
                pady=4,
                justify="left",
            )
            label.pack()
        except Exception:
            self.tip = None

    def _hide(self, _event=None):
        if self.tip:
            try:
                self.tip.destroy()
            except Exception:
                pass
            self.tip = None


def _ellipsis_text(text, max_len):
    raw = str(text or "").strip()
    if not raw or len(raw) <= max_len:
        return raw
    return raw[: max(0, max_len - 1)].rstrip() + "…"


class Printer:
    def __init__(self):
        self._lock = threading.Lock()

    def print_pdf_bytes(self, pdf_bytes, job_name="CRM Receipt", copies=1, printer_name=None):
        if not WINDOWS_PRINTING_AVAILABLE:
            raise RuntimeError("Windows printing is not available")
        if not PDF_RENDER_AVAILABLE:
            raise RuntimeError("PDF render is not available")
        if not pdf_bytes:
            raise RuntimeError("Empty PDF data")

        images = self._render_pdf_to_images(pdf_bytes)
        if not images:
            raise RuntimeError("Failed to render PDF")

        with self._lock:
            for _ in range(max(1, int(copies))):
                self._print_images(images, job_name, printer_name=printer_name)

    def _render_pdf_to_images(self, pdf_bytes):
        pdf = pdfium.PdfDocument(pdf_bytes)
        images = []
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            # scale controls DPI; 6 improves sharpness on small text
            bitmap = page.render(scale=6)
            image = bitmap.to_pil()
            image = image.convert("RGB")
            image = self._trim_whitespace(image)
            images.append(image)
        return images

    def _trim_whitespace(self, image):
        if not PIL_AVAILABLE:
            return image
        try:
            gray = image.convert("L")
            bbox = ImageOps.invert(gray).getbbox()
            if not bbox:
                return image
            left, top, right, bottom = bbox
            pad = 8
            left = max(0, left - pad)
            top = max(0, top - pad)
            right = min(image.width, right + pad)
            bottom = min(image.height, bottom + pad)
            if right - left < 10 or bottom - top < 10:
                return image
            return image.crop((left, top, right, bottom))
        except Exception:
            return image

    def _ensure_unc_printer_connected(self, printer_name):
        if not printer_name or not printer_name.startswith("\\\\"):
            return
        try:
            win32print.AddPrinterConnection(printer_name)
        except Exception:
            # Printer can already be connected; keep going and let StartDoc decide.
            pass

    def _print_images(self, images, job_name, printer_name=None):
        requested_printer = str(printer_name or "").strip()
        if requested_printer:
            printer_name, printer_online = _get_printer_state(requested_printer)
        else:
            printer_name, printer_online = _get_default_printer_state()
        if not printer_name:
            raise RuntimeError("Не найден принтер по умолчанию")
        if not printer_online:
            raise RuntimeError(f"Принтер '{printer_name}' сейчас недоступен (offline)")
        last_error = None

        for attempt in range(3):
            hdc = None
            doc_started = False
            try:
                self._ensure_unc_printer_connected(printer_name)

                hdc = win32ui.CreateDC()
                hdc.CreatePrinterDC(printer_name)
                safe_job_name = str(job_name or "CRM Receipt").strip() or "CRM Receipt"
                hdc.StartDoc(safe_job_name[:180])
                doc_started = True
                printer_w = hdc.GetDeviceCaps(win32con.HORZRES)
                printer_h = hdc.GetDeviceCaps(win32con.VERTRES)
                for image in images:
                    segments = self._split_image_for_pages(image, printer_w, printer_h)
                    if not segments:
                        continue
                    for segment in segments:
                        hdc.StartPage()
                        try:
                            self._draw_image(hdc, segment, printer_w)
                        finally:
                            hdc.EndPage()
                return
            except Exception as e:
                last_error = e
                if attempt < 2:
                    time.sleep(0.5)
            finally:
                if hdc:
                    if doc_started:
                        try:
                            hdc.EndDoc()
                        except Exception:
                            pass
                    try:
                        hdc.DeleteDC()
                    except Exception:
                        pass

        raw_error = str(last_error) if last_error else "unknown"
        if "StartDoc failed" in raw_error:
            raise RuntimeError(
                f"Ошибка печати на '{printer_name}': StartDoc failed. "
                "Проверьте доступ к принтеру, службу 'Диспетчер печати' и драйвер принтера."
            )
        raise RuntimeError(f"Ошибка печати на '{printer_name}': {raw_error}")

    def _split_image_for_pages(self, image, printer_w, printer_h):
        img_w, img_h = image.size
        if img_w <= 0 or img_h <= 0 or printer_w <= 0 or printer_h <= 0:
            return []
        scale = printer_w / float(img_w)
        if scale <= 0:
            return [image]
        src_page_h = max(1, int(printer_h / scale))
        if img_h <= src_page_h:
            return [image]
        parts = []
        top = 0
        while top < img_h:
            bottom = min(img_h, top + src_page_h)
            parts.append(image.crop((0, top, img_w, bottom)))
            top = bottom
        return parts

    def _draw_image(self, hdc, image, printer_w=None):
        if printer_w is None:
            printer_w = hdc.GetDeviceCaps(win32con.HORZRES)
        img_w, img_h = image.size
        if img_w <= 0 or img_h <= 0 or printer_w <= 0:
            return
        # Always fit by width to avoid shrinking long receipts to a narrow column.
        scale = printer_w / float(img_w)
        target_w = max(1, int(img_w * scale))
        target_h = max(1, int(img_h * scale))
        x = 0
        y = 0
        dib = ImageWin.Dib(image)
        dib.draw(hdc.GetHandleOutput(), (x, y, x + target_w, y + target_h))



class HtmlRenderer:
    def __init__(self):
        self._browser_path = self._locate_browser()
        self._timeout = max(5.0, BROWSER_TIMEOUT)
        self._lock = threading.Lock()

    def is_available(self):
        return bool(self._browser_path and os.path.isfile(self._browser_path))

    def render(self, html, job_name="CRM Receipt"):
        if not html or not html.strip():
            raise RuntimeError("Пустой HTML для печати")
        if not self.is_available():
            raise RuntimeError(
                "Браузер не найден (установите Chrome/Edge или укажите PRINT_BROWSER_PATH)"
            )
        with self._lock:
            return self._render_with_browser(html, job_name)

    def _render_with_browser(self, html, job_name):
        tmpdir = tempfile.mkdtemp(prefix="crmprint_")
        try:
            html_path = os.path.join(tmpdir, "receipt.html")
            pdf_path = os.path.join(tmpdir, "receipt.pdf")
            profile_dir = os.path.join(tmpdir, "profile")
            os.makedirs(profile_dir, exist_ok=True)
            with open(html_path, "w", encoding="utf-8") as fh:
                fh.write(html)
            html_uri = pathlib.Path(html_path).as_uri()
            common_flags = [
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-sync",
                "--no-sandbox",
                "--disable-software-rasterizer",
                "--allow-file-access-from-files",
                f"--user-data-dir={profile_dir}",
                f"--print-to-pdf={pdf_path}",
                "--virtual-time-budget=10000",
                "--run-all-compositor-stages-before-draw",
                html_uri,
            ]
            # Some Chromium builds (notably Yandex) behave differently with headless flags.
            launch_variants = [
                ["--headless=new", "--print-to-pdf-no-header"],
                ["--headless", "--print-to-pdf-no-header"],
                ["--headless=new"],
                ["--headless"],
            ]
            diagnostics = []
            for variant in launch_variants:
                if os.path.exists(pdf_path):
                    try:
                        os.remove(pdf_path)
                    except Exception:
                        pass
                cmd = [self._browser_path] + variant + common_flags
                try:
                    proc = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                    )
                except Exception as exc:
                    diagnostics.append(f"start_failed {' '.join(variant)}: {exc}")
                    continue

                rendered_path = ""
                stdout = b""
                stderr = b""
                try:
                    rendered_path = self._wait_for_rendered_pdf(
                        tmpdir,
                        pdf_path,
                        wait_seconds=self._timeout,
                        process=proc,
                    )
                    if rendered_path:
                        try:
                            stdout, stderr = proc.communicate(timeout=1.5)
                        except subprocess.TimeoutExpired:
                            self._terminate_process(proc)
                            stdout, stderr = proc.communicate(timeout=3)
                        if os.path.isfile(rendered_path):
                            with open(rendered_path, "rb") as fh:
                                return fh.read()
                    else:
                        self._terminate_process(proc)
                        stdout, stderr = proc.communicate(timeout=3)
                except Exception:
                    self._terminate_process(proc)
                    try:
                        stdout, stderr = proc.communicate(timeout=3)
                    except Exception:
                        stdout, stderr = (b"", b"")
                    raise

                error_msg = (
                    stderr.decode("utf-8", "ignore").strip()
                    or stdout.decode("utf-8", "ignore").strip()
                    or "неизвестная ошибка"
                )
                if proc.returncode is None:
                    diagnostics.append(f"timeout: {' '.join(variant)}")
                else:
                    diagnostics.append(f"rc={proc.returncode} {' '.join(variant)}: {error_msg[:180]}")

            details = "; ".join(diagnostics[-3:]) if diagnostics else "нет деталей"
            raise RuntimeError(f"Браузер не смог подготовить PDF: {details}")
        finally:
            self._safe_rmtree(tmpdir)

    def _find_rendered_pdf(self, directory):
        try:
            files = []
            for name in os.listdir(directory):
                if not name.lower().endswith(".pdf"):
                    continue
                path = os.path.join(directory, name)
                if os.path.isfile(path) and os.path.getsize(path) > 0:
                    files.append(path)
            if not files:
                return ""
            files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
            return files[0]
        except Exception:
            return ""

    def _wait_for_rendered_pdf(self, directory, preferred_path, wait_seconds=6.0, process=None):
        deadline = time.time() + max(0.5, float(wait_seconds))
        while time.time() < deadline:
            if preferred_path and os.path.isfile(preferred_path):
                try:
                    if os.path.getsize(preferred_path) > 0:
                        return preferred_path
                except Exception:
                    pass
            any_pdf = self._find_rendered_pdf(directory)
            if any_pdf:
                return any_pdf
            if process is not None and process.poll() is not None:
                break
            time.sleep(0.15)
        if preferred_path and os.path.isfile(preferred_path):
            try:
                if os.path.getsize(preferred_path) > 0:
                    return preferred_path
            except Exception:
                pass
        any_pdf = self._find_rendered_pdf(directory)
        if any_pdf:
            return any_pdf
        return ""

    def _terminate_process(self, process):
        if not process or process.poll() is not None:
            return
        try:
            process.terminate()
            process.wait(timeout=1.5)
            return
        except Exception:
            pass
        try:
            process.kill()
        except Exception:
            pass

    def _safe_rmtree(self, path):
        try:
            if path and os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass

    def _locate_browser(self):
        explicit = (os.environ.get("PRINT_BROWSER_PATH") or "").strip()
        if explicit and os.path.isfile(explicit):
            return explicit

        candidates = []
        for root_key in ("ProgramFiles", "ProgramFiles(x86)"):
            root = os.environ.get(root_key)
            if not root:
                continue
            candidates.append(os.path.join(root, "Google", "Chrome", "Application", "chrome.exe"))
            candidates.append(os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"))
            candidates.append(os.path.join(root, "Chromium", "Application", "chrome.exe"))
            candidates.append(os.path.join(root, "Yandex", "YandexBrowser", "Application", "browser.exe"))
            candidates.append(os.path.join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"))
            candidates.append(os.path.join(root, "Opera", "launcher.exe"))

        local_appdata = os.environ.get("LocalAppData")
        if local_appdata:
            candidates.append(os.path.join(local_appdata, "Google", "Chrome", "Application", "chrome.exe"))
            candidates.append(os.path.join(local_appdata, "Microsoft", "Edge", "Application", "msedge.exe"))
            candidates.append(os.path.join(local_appdata, "Chromium", "Application", "chrome.exe"))
            candidates.append(os.path.join(local_appdata, "Yandex", "YandexBrowser", "Application", "browser.exe"))
            candidates.append(os.path.join(local_appdata, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"))
            candidates.append(os.path.join(local_appdata, "Opera Software", "Opera Stable", "launcher.exe"))

        user_profile = os.environ.get("USERPROFILE")
        if user_profile:
            candidates.append(os.path.join(user_profile, "Downloads", "chrome.exe"))
            candidates.append(os.path.join(user_profile, "Downloads", "msedge.exe"))

        extra_candidates = [
            os.path.join(user_profile, "AppData", "Local", "Yandex", "YandexBrowser", "Application", "browser.exe"),
            os.path.join(user_profile, "AppData", "Local", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(user_profile, "AppData", "Local", "Chromium", "chrome.exe"),
            os.path.join(user_profile, "AppData", "Local", "Opera Software", "Opera Stable", "launcher.exe"),
        ]
        candidates.extend([c for c in extra_candidates if c])

        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return candidate

        for name in ("chrome.exe", "msedge.exe", "browser.exe", "brave.exe", "opera.exe"):
            resolved = shutil.which(name)
            if resolved:
                return resolved

        return ""

def _normalize_layout(layout):
    if not layout:
        return []
    normalized = []
    for item in layout:
        if isinstance(item, str):
            normalized.append({"text": item, "align": "left", "bold": False, "size": 12})
        elif isinstance(item, dict):
            normalized.append({
                "text": str(item.get("text", "")),
                "align": item.get("align", "left"),
                "bold": bool(item.get("bold", False)),
                "size": int(item.get("size", 12))
            })
    return normalized


class PrintRequestHandler(BaseHTTPRequestHandler):
    server_version = "CRMPrintBot/1.0"

    def log_message(self, format, *args):
        # redirect default HTTP logs to main logger
        logging.info("%s - %s", self.address_string(), format % args)

    def _send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/health"):
            return self._send_json(200, {"ok": True})
        self._send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/print":
            return self._send_json(404, {"ok": False, "error": "not_found"})

        config = load_config()
        token = self.headers.get("X-Api-Key", "")
        expected_token = (config.get("token") or "").strip()
        if not token or token != expected_token:
            return self._send_json(401, {"ok": False, "error": "invalid_token"})

        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            content_length = 0
        raw = self.rfile.read(content_length) if content_length else b""
        try:
            payload = json.loads(raw.decode("utf-8", "ignore") or "{}")
        except Exception:
            return self._send_json(400, {"ok": False, "error": "invalid_json"})

        pdf_base64 = payload.get("pdf_base64") or payload.get("pdfBase64")
        if not pdf_base64:
            return self._send_json(400, {"ok": False, "error": "missing_pdf"})

        order = payload.get("order") or {}
        cache_key = _get_order_cache_key(order)
        if cache_key and self.server.cache.has(cache_key):
            logging.info("Повторный чек %s - печать пропущена", cache_key)
            return self._send_json(200, {"ok": True, "skipped": True})

        try:
            pdf_bytes = _decode_pdf_base64(pdf_base64)
        except Exception:
            return self._send_json(400, {"ok": False, "error": "bad_pdf"})

        order_id = None
        if isinstance(order, dict):
            order_id = order.get("id") or order.get("order_id") or order.get("orderId")
        job_name = f"CRM Receipt #{order_id}" if order_id else "CRM Receipt"

        try:
            copies = self._get_copies()
            self.server.printer.print_pdf_bytes(pdf_bytes, job_name=job_name, copies=copies)
        except Exception:
            logging.exception("Ошибка печати")
            return self._send_json(500, {"ok": False, "error": "print_failed"})

        if cache_key:
            self.server.cache.add(cache_key)
        logging.info("PDF-чек '%s' отправлен в печать", job_name)
        return self._send_json(200, {"ok": True})


class _HTTPServer(HTTPServer):
    def __init__(self, server_address, handler_class, cache, printer):
        self.cache = cache
        self.printer = printer
        super().__init__(server_address, handler_class)


class PrintServer:
    def __init__(self, token_getter, copies_getter, poll_interval=2.0):
        self._token_getter = token_getter
        self._copies_getter = copies_getter
        self._poll_interval = max(1.0, float(poll_interval))
        self._request_timeout = max(3.0, float(CRM_HTTP_TIMEOUT))
        self._fetch_retries = max(1, int(CRM_FETCH_RETRIES))
        self._stop_event = threading.Event()
        self._thread = None
        self._last_poll_error_ts = 0.0
        self.cache = PrintedCache(CACHE_PATH)
        self.printer = Printer()
        self._renderer = HtmlRenderer()
        self._sound = SoundNotifier(CRM_BASE_URL, DATA_DIR)
        self._notify_new_order_enabled = True
        self._notify_new_message_enabled = True
        self._sound_new_order_url = ""
        self._sound_new_message_url = ""
        self._last_token_info_refresh_ts = 0.0
        self._token_info_refresh_interval = 20.0
        self._orders_cursor_initialized = False
        self._startup_job_cursor_id = 0
        self._last_order_sound_ts = 0.0
        self._message_delay_after_order_sec = 2.0
        self._message_order_window_sec = 2.0
        self._message_poll_interval_sec = 6.0
        self._last_message_poll_ts = 0.0
        self._last_message_event_id = 0
        self._messages_cursor_initialized = False
        self._last_message_poll_error_ts = 0.0
        self._heartbeat_interval = max(5.0, float(CRM_HEARTBEAT_INTERVAL))
        self._last_heartbeat_ts = 0.0
        self._printer_sync_interval = max(10.0, float(CRM_PRINTER_SYNC_INTERVAL))
        self._last_printer_sync_ts = 0.0
        self._last_printer_sync_error_ts = 0.0
        self._synced_printers_by_system_name = {}
        self._selected_printer_system_name = ""
        self._connection_ok = True
        self._consecutive_connection_errors = 0
        self._reconnect_error_threshold = 12
        self._last_successful_contact_ts = 0.0
        self.set_crm_base_url(get_runtime_crm_base_url())

    def set_crm_base_url(self, base_url):
        normalized = set_runtime_crm_base_url(base_url)
        self._sound.set_base_url(normalized)
        return normalized

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._orders_cursor_initialized = False
        self._startup_job_cursor_id = 0
        self._messages_cursor_initialized = False
        self._last_message_poll_ts = 0.0
        self._last_heartbeat_ts = 0.0
        self._last_printer_sync_ts = 0.0
        self._connection_ok = True
        self._consecutive_connection_errors = 0
        self._last_successful_contact_ts = time.time()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logging.info("Сервер печати запущен: polling %s", get_runtime_crm_base_url())

    def stop(self):
        if not self._thread:
            return
        self._stop_event.set()
        self._thread.join(timeout=5)
        self._thread = None
        logging.info("Сервер печати остановлен")

    def _poll_loop(self):
        while not self._stop_event.is_set():
            token = ""
            try:
                token = (self._token_getter() or "").strip()
            except Exception:
                token = ""

            if not token:
                self._stop_event.wait(self._poll_interval)
                continue

            self._send_agent_heartbeat(token)
            self._sync_printers(token)
            self._refresh_notification_settings(token)
            self._initialize_orders_cursor(token)
            self._initialize_messages_cursor(token)

            try:
                bundle = self._fetch_poll_bundle(token)
            except Exception:
                logging.exception("Ошибка запроса к CRM (/api/print/poll)")
                self._note_connection_error()
                self._maybe_force_reconnect()
                self._stop_event.wait(self._poll_interval)
                continue

            if not isinstance(bundle, dict):
                self._maybe_force_reconnect()
                self._stop_event.wait(self._poll_interval)
                continue

            drained_any_job = False
            message_event = bundle.get("message_event")
            message_cursor = bundle.get("message_cursor")
            try:
                cursor_id = int(message_cursor or 0)
            except Exception:
                cursor_id = 0
            if cursor_id > 0:
                self._last_message_event_id = max(self._last_message_event_id, cursor_id)

            while not self._stop_event.is_set():
                job = bundle.get("job")
                if not job:
                    break
                drained_any_job = True
                self._process_job(token, job)
                try:
                    bundle = self._fetch_poll_bundle(token)
                except Exception:
                    logging.exception("Ошибка запроса к CRM (/api/print/poll)")
                    self._note_connection_error()
                    break
                if not isinstance(bundle, dict):
                    break
                message_event = bundle.get("message_event") if not drained_any_job else message_event
                message_cursor = bundle.get("message_cursor")
                try:
                    cursor_id = int(message_cursor or 0)
                except Exception:
                    cursor_id = 0
                if cursor_id > 0:
                    self._last_message_event_id = max(self._last_message_event_id, cursor_id)

            if message_event and not drained_any_job:
                self._play_message_notification_with_delay()
            self._maybe_force_reconnect()
            self._stop_event.wait(self._poll_interval)

    def _mark_connection_restored_if_needed(self):
        if not self._connection_ok:
            self._connection_ok = True
            logging.info("Связь с CRM восстановлена")

    def _note_successful_contact(self):
        self._last_successful_contact_ts = time.time()
        self._consecutive_connection_errors = 0
        self._mark_connection_restored_if_needed()

    def _note_connection_error(self):
        self._consecutive_connection_errors += 1
        if self._connection_ok:
            self._connection_ok = False
            logging.warning("Связь с CRM потеряна, запускаю авто-восстановление")

    def _maybe_force_reconnect(self):
        if self._consecutive_connection_errors < self._reconnect_error_threshold:
            return
        logging.warning(
            "Слишком много ошибок связи подряд (%s). Перезапускаю transport polling.",
            self._consecutive_connection_errors,
        )
        # Soft restart transport: короткая пауза перед новой попыткой.
        self._consecutive_connection_errors = 0
        self._stop_event.wait(1.5)

    def _log_poll_warning(self, message):
        now = time.time()
        if (now - self._last_poll_error_ts) >= 15.0:
            logging.warning(message)
            self._last_poll_error_ts = now

    def _refresh_notification_settings(self, token, force=False):
        now = time.time()
        if not force and (now - self._last_token_info_refresh_ts) < self._token_info_refresh_interval:
            return
        url = build_crm_request_url(CRM_BASE_URL, "/api/print/token-info")
        req = urllib.request.Request(url, method="GET", headers={"X-Api-Key": token})
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                body = resp.read().decode("utf-8", "ignore")
                self._note_successful_contact()
        except Exception:
            self._note_connection_error()
            return
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}
        if not payload or not payload.get("ok"):
            return
        info = payload.get("data") or {}
        notifications = info.get("notifications") if isinstance(info.get("notifications"), dict) else {}
        # Backward-compatible fallback: if notifications object is missing,
        # try top-level token-info fields.
        new_order_enabled = notifications.get("new_order_enabled")
        if new_order_enabled is None:
            new_order_enabled = info.get("notify_new_order_enabled")
        new_message_enabled = notifications.get("new_message_enabled")
        if new_message_enabled is None:
            new_message_enabled = info.get("notify_new_message_enabled")
        sound_new_order_url = notifications.get("sound_new_order_url")
        if not sound_new_order_url:
            sound_new_order_url = info.get("sound_new_order_url")
        sound_new_message_url = notifications.get("sound_new_message_url")
        if not sound_new_message_url:
            sound_new_message_url = info.get("sound_new_message_url")

        self._notify_new_order_enabled = bool(True if new_order_enabled is None else new_order_enabled)
        self._notify_new_message_enabled = bool(True if new_message_enabled is None else new_message_enabled)
        self._sound_new_order_url = str(sound_new_order_url or "").strip()
        self._sound_new_message_url = str(sound_new_message_url or "").strip()
        self._last_token_info_refresh_ts = now

    def _send_agent_heartbeat(self, token, force=False):
        if not token:
            return False
        now = time.time()
        if not force and (now - self._last_heartbeat_ts) < self._heartbeat_interval:
            return False

        printer_name, printer_online = _get_default_printer_state()
        payload = {
            "printer_name": printer_name or None,
            "printer_online": bool(printer_online),
            "agent_name": APP_NAME,
            "agent_version": AGENT_VERSION,
            "running": True,
        }
        url = build_crm_request_url(CRM_BASE_URL, "/api/print/agent/heartbeat")
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=raw,
            method="POST",
            headers={
                "X-Api-Key": token,
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(raw)),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=min(self._request_timeout, 6.0)) as resp:
                body = resp.read().decode("utf-8", "ignore")
                data = json.loads(body) if body else {}
                if not data or not data.get("ok"):
                    return False
                self._last_heartbeat_ts = now
                self._note_successful_contact()
                return True
        except Exception:
            return False

    def _sync_printers(self, token, force=False):
        if not token:
            return False
        now = time.time()
        if not force and (now - self._last_printer_sync_ts) < self._printer_sync_interval:
            return False

        payload = _build_printers_sync_payload()
        url = build_crm_request_url(CRM_BASE_URL, "/api/print/printers/sync")
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=raw,
            method="POST",
            headers={
                "X-Api-Key": token,
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(raw)),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=min(self._request_timeout, 6.0)) as resp:
                body = resp.read().decode("utf-8", "ignore")
                data = json.loads(body) if body else {}
                if not data or not (data.get("ok") or data.get("success")):
                    return False
                response_printers = data.get("data", {}).get("printers") if isinstance(data.get("data"), dict) else []
                if isinstance(response_printers, list):
                    synced = {}
                    selected_printer = ""
                    for item in response_printers:
                        if not isinstance(item, dict):
                            continue
                        system_name = str(item.get("system_name") or "").strip()
                        if system_name:
                            synced[system_name.lower()] = item
                            if str(item.get("is_default") or "0") in ("1", "true", "True"):
                                selected_printer = system_name
                    self._synced_printers_by_system_name = synced
                    self._selected_printer_system_name = selected_printer
                self._last_printer_sync_ts = now
                self._note_successful_contact()
                return True
        except urllib.error.HTTPError as e:
            try:
                error_body = e.read().decode("utf-8", "ignore")
            except Exception:
                error_body = ""
            if (now - self._last_printer_sync_error_ts) >= 30.0:
                logging.warning(
                    "Не удалось синхронизировать список принтеров: HTTP %s %s",
                    getattr(e, "code", ""),
                    error_body[:300],
                )
                self._last_printer_sync_error_ts = now
            return False
        except Exception as e:
            if (now - self._last_printer_sync_error_ts) >= 30.0:
                logging.warning("Не удалось синхронизировать список принтеров: %s", str(e))
                self._last_printer_sync_error_ts = now
            return False


    def _play_order_notification_sound(self):
        # Если URL пока не подтянулся (например, кратковременный обрыв при старте),
        # вызывающая сторона может предварительно форсировать refresh token-info.
        if not self._notify_new_order_enabled:
            logging.info("Звук нового заказа отключен (notify_new_order_enabled=0)")
            return False
        if self._sound_new_order_url:
            logging.info("Пробую проиграть звук нового заказа: %s", self._sound_new_order_url)
            ok = self._sound.play(self._sound_new_order_url)
            if not ok:
                logging.warning("Не удалось проиграть звук нового заказа: %s", self._sound_new_order_url)
            if ok:
                logging.info("Звук нового заказа поставлен в очередь: %s", self._sound_new_order_url)
                self._last_order_sound_ts = time.time()
            return bool(ok)
        logging.warning("Для нового заказа не задан URL звука в token-info")
        return False

    def _initialize_orders_cursor(self, token):
        if self._orders_cursor_initialized:
            return
        url = build_crm_request_url(CRM_BASE_URL, "/api/print/jobs/cursor")
        req = urllib.request.Request(url, method="GET", headers={"X-Api-Key": token})
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                body = resp.read().decode("utf-8", "ignore")
        except Exception:
            return
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}
        if not payload or not payload.get("ok"):
            return
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        last_id = int(data.get("last_id") or 0)
        if last_id > 0:
            self._startup_job_cursor_id = max(self._startup_job_cursor_id, last_id)
        self._orders_cursor_initialized = True

    def _initialize_messages_cursor(self, token):
        if self._messages_cursor_initialized:
            return
        url = build_crm_request_url(CRM_BASE_URL, "/api/print/poll?after_message_id=-1")
        req = urllib.request.Request(url, method="GET", headers={"X-Api-Key": token})
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                body = resp.read().decode("utf-8", "ignore")
                self._note_successful_contact()
        except Exception:
            self._note_connection_error()
            return
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}
        if not payload or not payload.get("ok"):
            return
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        last_id = int(data.get("message_cursor") or 0)
        if last_id > 0:
            self._last_message_event_id = max(self._last_message_event_id, last_id)
        self._messages_cursor_initialized = True

    def _play_message_notification_sound(self):
        if not self._notify_new_message_enabled:
            return
        if self._sound_new_message_url:
            logging.info("Пробую проиграть звук нового сообщения: %s", self._sound_new_message_url)
            ok = self._sound.play(self._sound_new_message_url)
            if not ok:
                logging.warning("Не удалось проиграть звук нового сообщения: %s", self._sound_new_message_url)
            if ok:
                logging.info("Звук нового сообщения поставлен в очередь: %s", self._sound_new_message_url)
            return

    def _play_message_notification_with_delay(self):
        now = time.time()
        delay = 0.0
        elapsed_from_order = now - float(self._last_order_sound_ts or 0.0)
        if elapsed_from_order >= 0 and elapsed_from_order < self._message_order_window_sec:
            delay = self._message_delay_after_order_sec

        def worker():
            if delay > 0:
                time.sleep(delay)
            self._play_message_notification_sound()

        threading.Thread(target=worker, daemon=True).start()

    def _fetch_poll_bundle(self, token):
        cursor = int(self._last_message_event_id or 0)
        url = build_crm_request_url(CRM_BASE_URL, f"/api/print/poll?after_message_id={cursor}")
        req = urllib.request.Request(url, method="GET", headers={"X-Api-Key": token})
        body = ""
        for attempt in range(1, self._fetch_retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self._request_timeout) as resp:
                    body = resp.read().decode("utf-8", "ignore")
                    self._note_successful_contact()
                break
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    logging.warning("Ключ API отклонен CRM: HTTP %s", e.code)
                    return None
                if attempt < self._fetch_retries:
                    self._stop_event.wait(min(1.0, 0.25 * attempt))
                    continue
                self._log_poll_warning("CRM /api/print/poll вернул HTTP %s" % e.code)
                return None
            except (urllib.error.URLError, TimeoutError) as e:
                self._note_connection_error()
                if attempt < self._fetch_retries:
                    self._stop_event.wait(min(1.0, 0.25 * attempt))
                    continue
                reason = getattr(e, "reason", None)
                msg = str(reason or e or "request_timeout")
                self._log_poll_warning(
                    "Таймаут/сеть при запросе к CRM (/api/print/poll, timeout=%ss): %s"
                    % (self._request_timeout, msg)
                )
                return None
            except Exception as e:
                self._note_connection_error()
                if attempt < self._fetch_retries:
                    self._stop_event.wait(min(1.0, 0.25 * attempt))
                    continue
                self._log_poll_warning("Ошибка запроса к CRM (/api/print/poll): %s" % str(e))
                return None

        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}
        if not payload or not payload.get("ok"):
            return None
        return payload.get("data")

    def _post_job_result(self, token, job_id, endpoint, payload=None):
        url = build_crm_request_url(CRM_BASE_URL, f"/api/print/jobs/{job_id}/{endpoint}")
        raw = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=raw,
            method="POST",
            headers={
                "X-Api-Key": token,
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(raw))
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=self._request_timeout):
                return True
        except Exception:
            return False

    def _process_job(self, token, job):
        if not isinstance(job, dict):
            return
        job_id = job.get("job_id") or job.get("id")
        if not job_id:
            return
        order = job.get("order") if isinstance(job.get("order"), dict) else {}
        job_payload = job.get("pdf_base64") or job.get("pdfBase64")
        meta_payload = _decode_meta_job(job_payload) if _is_meta_job(job_payload) else {}
        is_label_job = isinstance(meta_payload, dict) and str(meta_payload.get("kind") or "").strip().lower() == "label"
        cache_key = None
        if is_label_job:
            cache_key = f"label_job:{job_id}"
        else:
            cache_key = _get_order_cache_key(order) or f"job:{job_id}"

        if cache_key and self.cache.has(cache_key):
            logging.info("Повторная задача %s - печать пропущена", cache_key)
            self._post_job_result(token, job_id, "ack", {})
            return

        if not job_payload:
            self._post_job_result(token, job_id, "fail", {"error": "missing_pdf"})
            return

        order_id = None
        if isinstance(order, dict):
            order_id = order.get("id") or order.get("order_id") or order.get("orderId")
        job_name = job.get("job_name") or (f"CRM Receipt #{order_id}" if order_id else "CRM Receipt")

        try:
            pdf_bytes = self._prepare_job_pdf(job_payload, job_name, job_id)
        except Exception as exc:
            logging.exception("Ошибка подготовки PDF задания %s", job_id)
            self._post_job_result(token, job_id, "fail", {"error": str(exc)})
            return

        try:
            copies = self._copies_getter()
        except Exception:
            copies = 1
        try:
            if isinstance(meta_payload, dict) and meta_payload.get("copies") is not None:
                copies = max(1, int(meta_payload.get("copies") or 1))
        except Exception:
            pass

        printer_name = self._selected_printer_system_name
        if isinstance(meta_payload, dict):
            meta_printer_name = str(meta_payload.get("printer_name") or "").strip()
            if meta_printer_name:
                printer_name = meta_printer_name

        try:
            should_play_order_sound = not is_label_job
            if should_play_order_sound:
                try:
                    numeric_job_id = int(job_id)
                except Exception:
                    numeric_job_id = 0
                try:
                    job_attempts = int(job.get("attempts") or 0)
                except Exception:
                    job_attempts = 0
                if self._orders_cursor_initialized and numeric_job_id > 0 and numeric_job_id <= int(self._startup_job_cursor_id or 0):
                    should_play_order_sound = False
                    logging.info(
                        "Звук заказа пропущен по стартовому курсору: job_id=%s <= startup_cursor=%s",
                        numeric_job_id,
                        int(self._startup_job_cursor_id or 0),
                    )
                elif job_attempts > 1:
                    should_play_order_sound = False
                    logging.info(
                        "Звук заказа пропущен для повторной попытки печати: job_id=%s, attempts=%s",
                        job_id,
                        job_attempts,
                    )
                if should_play_order_sound:
                    if not self._sound_new_order_url:
                        # Подстраховка: принудительно обновляем настройки звука перед воспроизведением.
                        self._refresh_notification_settings(token, force=True)
                    self._play_order_notification_sound()
            self.printer.print_pdf_bytes(
                pdf_bytes,
                job_name=job_name,
                copies=copies,
                printer_name=printer_name,
            )
        except Exception as e:
            logging.exception("Ошибка печати задания %s", job_id)
            self._post_job_result(token, job_id, "fail", {"error": str(e)})
            return

        if cache_key:
            self.cache.add(cache_key)
        if self._post_job_result(token, job_id, "ack", {}):
            logging.info("Задание %s отправлено в печать", job_id)
        else:
            logging.warning("Не удалось отправить ack для задания %s", job_id)

    def _prepare_job_pdf(self, payload, job_name, job_id):
        if _is_meta_job(payload):
            meta = _decode_meta_job(payload)
            html = str(meta.get("html") or "").strip()
            if not html:
                raise RuntimeError("HTML-паттерн пустой")
            if not self._renderer.is_available():
                raise RuntimeError("Браузер для HTML не найден")
            return self._renderer.render(html, job_name=job_name)
        if _is_html_job(payload):
            html = _decode_html_job(payload)
            if not html.strip():
                raise RuntimeError("HTML-паттерн пустой")
            if not self._renderer.is_available():
                raise RuntimeError("Браузер для HTML не найден")
            return self._renderer.render(html, job_name=job_name)
        return _decode_pdf_base64(payload)


class ConfigApp(ctk.CTk if UI_BACKEND == "ctk" else tk.Tk):
    def __init__(self):
        if UI_BACKEND == "ctk":
            ctk.set_appearance_mode("dark")
        super().__init__()
        self._icon_path = self._resolve_icon_path()
        self._tk_icon_image = None
        self._apply_window_icon()
        self._crm_url_check_timer = None
        self._crm_url_check_seq = 0
        self._token_check_timer = None
        self._token_check_in_progress = False
        self._pending_token_check_key = None
        self._server = PrintServer(token_getter=self._get_token, copies_getter=self._get_copies)
        self._server_running = False
        self._token_ok = False
        self._crm_url_ok = None
        self._crm_url_problem = ""
        self._copies_var = tk.StringVar(value=str(DEFAULT_CONFIG["copies"]))
        self._tray_icon = None
        self._tray_thread = None
        self._in_tray = False
        self._autostart_var = tk.BooleanVar(value=False)
        self._autostart_icon = None
        self._printer_timer = None
        self._ctrl_handlers = {
            86: self._force_paste,  # V
            67: self._force_copy,   # C
            88: self._force_cut,    # X
            65: self._force_select_all  # A
        }

        self._build_ui()
        self._bind_clipboard_shortcuts()
        self._load_config()
        self._refresh_printer_ui()
        self._schedule_printer_refresh(1000)

        self._set_running_state(False)

    def _resolve_icon_path(self):
        candidates = [
            _resource_path("icon.ico"),
            os.path.join(os.path.dirname(sys.executable), "icon.ico"),
        ]
        for p in candidates:
            if p and os.path.isfile(p):
                return p
        return ""

    def _apply_window_icon(self):
        if not self._icon_path:
            return
        try:
            self.iconbitmap(self._icon_path)
        except Exception:
            pass
        # Fallback for Tk builds that ignore iconbitmap (convert ICO -> PNG via PIL).
        try:
            if PIL_AVAILABLE:
                icon_img = Image.open(self._icon_path).convert("RGBA")
                icon_img.thumbnail((64, 64), Image.LANCZOS)
                buf = io.BytesIO()
                icon_img.save(buf, format="PNG")
                encoded = base64.b64encode(buf.getvalue())
                self._tk_icon_image = tk.PhotoImage(data=encoded)
                self.iconphoto(True, self._tk_icon_image)
                return
        except Exception:
            self._tk_icon_image = None
        # Last fallback: try direct load.
        try:
            self._tk_icon_image = tk.PhotoImage(file=self._icon_path)
            self.iconphoto(True, self._tk_icon_image)
        except Exception:
            self._tk_icon_image = None

    def _build_ui(self):
        self.title(APP_NAME)
        self.geometry("540x500")
        self.resizable(False, False)

        if UI_BACKEND == "ctk":
            self.configure(fg_color=UI_COLORS["bg"])
        else:
            self.configure(bg=UI_COLORS["bg"])

        self.crm_base_url_var = tk.StringVar(value=DEFAULT_CONFIG["crm_base_url"])
        self.token_var = tk.StringVar()
        header_font = ("Segoe UI", 18, "bold")
        label_font = ("Segoe UI", 12)
        small_font = ("Segoe UI", 11)

        if UI_BACKEND == "ctk":
            self.card_frame = ctk.CTkFrame(self, fg_color=UI_COLORS["card"], corner_radius=12)
        else:
            self.card_frame = tk.Frame(self, bg=UI_COLORS["card"])
        self.card_frame.pack(padx=20, pady=(0, 10), fill="x")

        if UI_BACKEND == "ctk":
            self.card_frame.grid_columnconfigure(0, weight=1)
            self.card_frame.grid_columnconfigure(1, weight=1)
            self.card_frame.grid_columnconfigure(2, weight=1)
            self.store_label = ctk.CTkLabel(
                self.card_frame,
                text="",
                font=("Segoe UI", 16, "bold"),
                text_color=UI_COLORS["text"],
                anchor="center"
            )
            self.crm_url_label = ctk.CTkLabel(
                self.card_frame,
                text="CRM URL:",
                font=label_font,
                text_color=UI_COLORS["text"]
            )
            self.crm_url_entry = ctk.CTkEntry(
                self.card_frame,
                textvariable=self.crm_base_url_var,
                height=32,
                fg_color=UI_COLORS["bg"],
                border_color="#3a3a3a",
                text_color=UI_COLORS["text"]
            )
            self.token_label = ctk.CTkLabel(
                self.card_frame,
                text="X-Api-Key:",
                font=label_font,
                text_color=UI_COLORS["text"]
            )
            self.token_entry = ctk.CTkEntry(
                self.card_frame,
                textvariable=self.token_var,
                height=32,
                fg_color=UI_COLORS["bg"],
                border_color="#3a3a3a",
                text_color=UI_COLORS["text"]
            )
        else:
            self.card_frame.columnconfigure(0, weight=1)
            self.card_frame.columnconfigure(1, weight=1)
            self.card_frame.columnconfigure(2, weight=1)
            self.store_label = tk.Label(
                self.card_frame,
                text="",
                font=("Segoe UI", 16, "bold"),
                bg=UI_COLORS["card"],
                fg=UI_COLORS["text"],
                anchor="center",
                justify="center"
            )
            self.crm_url_label = tk.Label(
                self.card_frame,
                text="CRM URL:",
                font=label_font,
                bg=UI_COLORS["card"],
                fg=UI_COLORS["text"]
            )
            self.crm_url_entry = tk.Entry(
                self.card_frame,
                textvariable=self.crm_base_url_var,
                bg=UI_COLORS["bg"],
                fg=UI_COLORS["text"],
                insertbackground=UI_COLORS["text"],
                highlightthickness=1,
                highlightbackground="#3a3a3a"
            )
            self.token_entry = tk.Entry(
                self.card_frame,
                textvariable=self.token_var,
                bg=UI_COLORS["bg"],
                fg=UI_COLORS["text"],
                insertbackground=UI_COLORS["text"],
                highlightthickness=1,
                highlightbackground="#3a3a3a"
            )
            self.token_label = tk.Label(
                self.card_frame,
                text="X-Api-Key:",
                font=label_font,
                bg=UI_COLORS["card"],
                fg=UI_COLORS["text"]
            )

        self.store_label.grid(row=0, column=0, columnspan=3, padx=16, pady=(12, 8), sticky="ew")

        self.crm_url_label.grid(row=1, column=0, columnspan=3, padx=16, pady=(0, 4), sticky="w")
        self.crm_url_entry.grid(row=2, column=0, columnspan=3, padx=16, pady=(0, 8), sticky="ew")
        self.crm_url_entry.bind("<Button-3>", self._show_context_menu)

        self.token_label.grid(row=3, column=0, columnspan=3, padx=16, pady=(0, 4), sticky="w")
        self.token_entry.grid(row=4, column=0, columnspan=3, padx=16, pady=(0, 8), sticky="ew")
        self.token_entry.bind("<Button-3>", self._show_context_menu)
        self.card_frame.grid_rowconfigure(0, minsize=28)
        self.card_frame.grid_rowconfigure(4, minsize=28)

        if UI_BACKEND == "ctk":
            self.printer_frame = ctk.CTkFrame(self.card_frame, fg_color=UI_COLORS["card"], corner_radius=0)
        else:
            self.printer_frame = tk.Frame(self.card_frame, bg=UI_COLORS["card"])

        self.printer_frame.grid(row=5, column=0, columnspan=3, padx=16, pady=(8, 10), sticky="ew")
        self.printer_frame.grid_columnconfigure(0, weight=1)
        self.printer_frame.grid_columnconfigure(1, weight=0)
        self.printer_frame.grid_columnconfigure(2, weight=0)

        self.printers_section_label = tk.Label(
            self.printer_frame,
            text="Подключённые принтеры",
            font=("Segoe UI", 11, "bold"),
            bg=UI_COLORS["card"],
            fg=UI_COLORS["text"],
            anchor="w",
            justify="left"
        )
        self.printers_section_label.grid(row=0, column=0, padx=(0, 10), pady=(0, 6), sticky="w")
        self.autostart_button = tk.Canvas(
            self.printer_frame,
            width=30,
            height=30,
            bg=UI_COLORS["card"],
            highlightthickness=0,
            bd=0,
            cursor="hand2",
        )
        self.printer_settings_button = tk.Canvas(
            self.printer_frame,
            width=30,
            height=30,
            bg=UI_COLORS["card"],
            highlightthickness=0,
            bd=0,
            cursor="hand2",
        )
        self.autostart_button.grid(row=0, column=1, padx=(0, 6), pady=(0, 6), sticky="e")
        self.printer_settings_button.grid(row=0, column=2, padx=(0, 0), pady=(0, 6), sticky="e")
        self.autostart_button.bind("<Button-1>", lambda _e: self._toggle_autostart())
        _Tooltip(self.autostart_button, lambda: "Автозапуск Windows")
        self.printer_settings_button.bind("<Button-1>", lambda _e: self._open_windows_printers())
        _Tooltip(self.printer_settings_button, lambda: "Устройства и принтеры")
        self._render_autostart_icon()
        self._render_printer_settings_icon()

        self.printers_table_container = tk.Frame(self.printer_frame, bg=UI_COLORS["card"])
        self.printers_table_container.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(0, 0))
        self.printers_table_container.grid_columnconfigure(0, weight=1)
        self._table_style = ttk.Style(self)
        try:
            self._table_style.theme_use("clam")
        except Exception:
            pass
        self._table_style.configure(
            "Printers.Treeview",
            background=UI_COLORS["card"],
            fieldbackground=UI_COLORS["card"],
            foreground=UI_COLORS["text"],
            rowheight=42,
            borderwidth=0,
            relief="flat",
            font=("Segoe UI", 10),
        )
        self._table_style.configure(
            "Printers.Treeview.Heading",
            background="#313131",
            foreground=UI_COLORS["muted"],
            relief="flat",
            font=("Segoe UI", 10, "bold"),
        )
        self._table_style.map(
            "Printers.Treeview",
            background=[("selected", "#3a3a3a")],
            foreground=[("selected", UI_COLORS["text"])],
        )
        self.printers_table_tree = ttk.Treeview(
            self.printers_table_container,
            columns=("name", "status", "settings"),
            show="headings",
            style="Printers.Treeview",
            selectmode="none",
            height=1,
        )
        self.printers_table_tree.grid(row=0, column=0, sticky="ew")
        self.printers_table_tree.heading("name", text="Название")
        self.printers_table_tree.heading("status", text="Статус")
        self.printers_table_tree.heading("settings", text="Настройки")
        self.printers_table_tree.column("name", anchor="w", width=260, stretch=True)
        self.printers_table_tree.column("status", anchor="center", width=100, stretch=False)
        self.printers_table_tree.column("settings", anchor="center", width=100, stretch=False)
        self.printers_table_tree.bind("<Motion>", self._on_printers_tree_motion)
        self.printers_table_tree.bind("<Button-1>", self._on_printers_tree_click)
        self.printers_table_tree.bind("<MouseWheel>", self._on_printers_tree_mousewheel)
        self.printers_table_tree.bind("<Button-4>", self._on_printers_tree_mousewheel)
        self.printers_table_tree.bind("<Button-5>", self._on_printers_tree_mousewheel)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self.crm_base_url_var.trace_add("write", lambda *_: self._on_crm_base_url_change())
        self.token_var.trace_add("write", lambda *_: self._on_token_change())
        self._context_widget = None
        self._build_context_menu()

        self.after(0, self._center_window)
        self.after(0, self._apply_window_chrome)
        self.after(250, self._apply_window_chrome)
        self.after(0, self._start_minimized_to_tray)

    def _apply_window_chrome(self):
        if os.name != "nt":
            return
        try:
            import ctypes as _ctypes
            user32 = _ctypes.windll.user32
            hwnd = self.winfo_id()
            parent_hwnd = user32.GetParent(hwnd)
            if parent_hwnd:
                hwnd = parent_hwnd
            GWL_STYLE = -16
            WS_MINIMIZEBOX = 0x00020000
            WS_MAXIMIZEBOX = 0x00010000
            get_window_long = getattr(user32, "GetWindowLongPtrW", None) or getattr(user32, "GetWindowLongW", None)
            set_window_long = getattr(user32, "SetWindowLongPtrW", None) or getattr(user32, "SetWindowLongW", None)
            if not get_window_long or not set_window_long:
                return
            style = get_window_long(hwnd, GWL_STYLE)
            style &= ~WS_MINIMIZEBOX
            style &= ~WS_MAXIMIZEBOX
            set_window_long(hwnd, GWL_STYLE, style)
            SWP_NOSIZE = 0x0001
            SWP_NOMOVE = 0x0002
            SWP_NOZORDER = 0x0004
            SWP_NOACTIVATE = 0x0010
            SWP_FRAMECHANGED = 0x0020
            user32.SetWindowPos(
                hwnd,
                0,
                0,
                0,
                0,
                0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            )
            user32.RedrawWindow(hwnd, None, None, 0x0400 | 0x0080 | 0x0001)
        except Exception:
            pass

    def _center_window(self):
        try:
            self.update_idletasks()
            width = self.winfo_width()
            height = self.winfo_height()
            screen_w = self.winfo_screenwidth()
            screen_h = self.winfo_screenheight()
            x = int((screen_w - width) / 2)
            y = int((screen_h - height) / 2)
            self.geometry(f"{width}x{height}+{x}+{y}")
        except Exception:
            pass

    def _build_copies_control(self, font, parent):
        if UI_BACKEND == "ctk":
            frame = ctk.CTkFrame(parent, fg_color=UI_COLORS["card"], corner_radius=8, height=34)
            entry = ctk.CTkEntry(
                frame,
                width=60,
                justify="center",
                textvariable=self._copies_var,
                font=font,
                fg_color=UI_COLORS["bg"],
                border_color="#3a3a3a",
                text_color=UI_COLORS["text"],
                height=32,
                state="normal"
            )
            btn_minus = ctk.CTkButton(frame, text="−", width=32, height=32, corner_radius=8,
                                       fg_color=UI_COLORS["accent"], hover_color=UI_COLORS["stop"],
                                       command=lambda: self._adjust_copies(-1))
            btn_plus = ctk.CTkButton(frame, text="+", width=32, height=32, corner_radius=8,
                                      fg_color=UI_COLORS["accent"], hover_color=UI_COLORS["stop_hover"],
                                      command=lambda: self._adjust_copies(1))
        else:
            frame = tk.Frame(parent, bg=UI_COLORS["card"])
            entry = tk.Entry(
                frame,
                width=4,
                justify="center",
                textvariable=self._copies_var,
                font=font,
                bg=UI_COLORS["bg"],
                fg=UI_COLORS["text"],
                relief="flat",
                insertbackground=UI_COLORS["text"]
            )
            btn_minus = tk.Button(
                frame,
                text="−",
                width=2,
                bg=UI_COLORS["accent"],
                fg="#fff",
                relief="flat",
                command=lambda: self._adjust_copies(-1)
            )
            btn_plus = tk.Button(
                frame,
                text="+",
                width=2,
                bg=UI_COLORS["accent"],
                fg="#fff",
                relief="flat",
                command=lambda: self._adjust_copies(1)
            )
        frame.grid_columnconfigure(1, weight=1)
        btn_minus.grid(row=0, column=0, padx=(4,0))
        entry.grid(row=0, column=1, padx=0)
        btn_plus.grid(row=0, column=2, padx=(0,4))
        return frame

    def _bind_clipboard_shortcuts(self):
        self.bind_all("<Control-v>", self._force_paste, add="+")
        self.bind_all("<Control-V>", self._force_paste, add="+")
        self.bind_all("<Control-c>", self._force_copy, add="+")
        self.bind_all("<Control-C>", self._force_copy, add="+")
        self.bind_all("<Control-x>", self._force_cut, add="+")
        self.bind_all("<Control-X>", self._force_cut, add="+")
        self.bind_all("<Control-a>", self._force_select_all, add="+")
        self.bind_all("<Control-A>", self._force_select_all, add="+")
        self.bind_all("<Control-KeyPress>", self._on_ctrl_keypress, add="+")
        self.crm_url_entry.bind("<Control-v>", self._force_paste, add="+")
        self.crm_url_entry.bind("<Control-V>", self._force_paste, add="+")
        self.crm_url_entry.bind("<Control-c>", self._force_copy, add="+")
        self.crm_url_entry.bind("<Control-C>", self._force_copy, add="+")
        self.crm_url_entry.bind("<Control-x>", self._force_cut, add="+")
        self.crm_url_entry.bind("<Control-X>", self._force_cut, add="+")
        self.crm_url_entry.bind("<Control-a>", self._force_select_all, add="+")
        self.crm_url_entry.bind("<Control-A>", self._force_select_all, add="+")
        self.crm_url_entry.bind("<Control-KeyPress>", self._on_ctrl_keypress, add="+")
        self.token_entry.bind("<Control-v>", self._force_paste, add="+")
        self.token_entry.bind("<Control-V>", self._force_paste, add="+")
        self.token_entry.bind("<Control-c>", self._force_copy, add="+")
        self.token_entry.bind("<Control-C>", self._force_copy, add="+")
        self.token_entry.bind("<Control-x>", self._force_cut, add="+")
        self.token_entry.bind("<Control-X>", self._force_cut, add="+")
        self.token_entry.bind("<Control-a>", self._force_select_all, add="+")
        self.token_entry.bind("<Control-A>", self._force_select_all, add="+")
        self.token_entry.bind("<Control-KeyPress>", self._on_ctrl_keypress, add="+")

    def _resolve_entry_widget(self, widget):
        if UI_BACKEND == "ctk" and hasattr(widget, "_entry"):
            return widget._entry
        return widget

    def _on_ctrl_keypress(self, event):
        handler = self._ctrl_handlers.get(event.keycode)
        if handler:
            return handler(event)
        return None

    def _copy_from_widget(self, widget):
        entry = self._resolve_entry_widget(widget)
        try:
            text = entry.selection_get()
        except Exception:
            return
        try:
            self.clipboard_clear()
            self.clipboard_append(text)
        except Exception:
            pass

    def _paste_to_widget(self, widget):
        entry = self._resolve_entry_widget(widget)
        try:
            text = self.clipboard_get()
        except Exception:
            return False
        try:
            try:
                if entry.selection_present():
                    entry.delete("sel.first", "sel.last")
            except Exception:
                pass
            entry.insert("insert", text)
            return True
        except Exception:
            return False

    def _cut_from_widget(self, widget):
        entry = self._resolve_entry_widget(widget)
        try:
            text = entry.selection_get()
        except Exception:
            return
        try:
            self.clipboard_clear()
            self.clipboard_append(text)
            entry.delete("sel.first", "sel.last")
        except Exception:
            pass

    def _select_all_widget(self, widget):
        entry = self._resolve_entry_widget(widget)
        try:
            entry.selection_range(0, "end")
            entry.icursor("end")
        except Exception:
            pass

    def _force_paste(self, event):
        widget = self._resolve_entry_widget(event.widget)
        try:
            widget.focus_set()
        except Exception:
            pass
        if self._paste_to_widget(widget):
            return "break"
        return None

    def _force_copy(self, event):
        widget = self._resolve_entry_widget(event.widget)
        self._copy_from_widget(widget)
        return "break"

    def _force_cut(self, event):
        widget = self._resolve_entry_widget(event.widget)
        self._cut_from_widget(widget)
        return "break"

    def _force_select_all(self, event):
        widget = self._resolve_entry_widget(event.widget)
        self._select_all_widget(widget)
        return "break"

    def _build_context_menu(self):
        self._context_menu = tk.Menu(self, tearoff=0)
        self._context_menu.add_command(label="Вставить", command=self._context_paste)
        self._context_menu.add_command(label="Копировать", command=self._context_copy)
        self._context_menu.add_command(label="Вырезать", command=self._context_cut)
        self._context_menu.add_separator()
        self._context_menu.add_command(label="Выделить всё", command=self._context_select_all)

    def _show_context_menu(self, event):
        self._context_widget = event.widget
        try:
            widget = self._resolve_entry_widget(event.widget)
            widget.focus_set()
        except Exception:
            pass
        try:
            self._context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            try:
                self._context_menu.grab_release()
            except Exception:
                pass
        return "break"

    def _context_copy(self):
        if self._context_widget:
            self._copy_from_widget(self._context_widget)

    def _context_paste(self):
        if self._context_widget:
            self._paste_to_widget(self._context_widget)

    def _context_cut(self):
        if self._context_widget:
            self._cut_from_widget(self._context_widget)

    def _context_select_all(self):
        if self._context_widget:
            self._select_all_widget(self._context_widget)

    def _load_config(self):
        data = load_config()
        crm_base_url = normalize_crm_base_url(data.get("crm_base_url"))
        self.crm_base_url_var.set(crm_base_url)
        self._server.set_crm_base_url(crm_base_url)
        token = (data.get("token") or "").strip()
        self.token_var.set(token)
        self._autostart_var.set(bool(data.get("autostart", False)))
        self._render_autostart_icon()
        self._set_crm_url_status(None, "")
        self._set_token_status(None, "")
        self._run_crm_url_check()
        self._run_token_check()

    def _save_config(self):
        crm_base_url = self._get_crm_base_url()
        token = self._get_token()
        save_config({
            "crm_base_url": crm_base_url,
            "token": token,
            "autostart": bool(self._autostart_var.get()),
        })

    def _get_autostart_registry_path(self):
        return r"Software\Microsoft\Windows\CurrentVersion\Run"

    def _get_autostart_command(self):
        if getattr(sys, "frozen", False):
            exe_path = os.path.abspath(sys.executable)
            return f'"{exe_path}"'
        script_path = os.path.abspath(__file__)
        python_exe = os.path.abspath(sys.executable)
        return f'"{python_exe}" "{script_path}"'

    def _is_autostart_enabled(self):
        if os.name != "nt" or not winreg:
            return bool(self._autostart_var.get())
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._get_autostart_registry_path(), 0, winreg.KEY_READ) as key:
                value, _ = winreg.QueryValueEx(key, APP_NAME)
                return bool(str(value or "").strip())
        except Exception:
            return False

    def _set_autostart_registry(self, enabled):
        if os.name != "nt" or not winreg:
            return False
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, self._get_autostart_registry_path(), 0, winreg.KEY_SET_VALUE) as key:
                if enabled:
                    winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, self._get_autostart_command())
                else:
                    try:
                        winreg.DeleteValue(key, APP_NAME)
                    except FileNotFoundError:
                        pass
            return True
        except Exception:
            return False

    def _on_autostart_change(self):
        enabled = bool(self._autostart_var.get())
        if os.name == "nt":
            if not self._set_autostart_registry(enabled):
                self._autostart_var.set(False)
                self._set_status("Не удалось изменить автозапуск", ok=False)
                return
        self._save_config()
        self._render_autostart_icon()

    def _toggle_autostart(self):
        self._autostart_var.set(not bool(self._autostart_var.get()))
        self._on_autostart_change()

    def _render_autostart_icon(self):
        canvas = getattr(self, "autostart_button", None)
        if not canvas:
            return
        try:
            canvas.delete("all")
        except Exception:
            return
        enabled = bool(self._autostart_var.get())
        fill = UI_COLORS["accent"] if enabled else "#5f5f5f"
        outline = UI_COLORS["accent_hover"] if enabled else "#8c8c8c"
        icon = "#ffffff"
        canvas.create_oval(2, 2, 28, 28, outline=outline, width=1.5, fill=fill)
        canvas.create_polygon(12, 9, 12, 21, 21, 15, outline=icon, fill=icon)

    def _render_printer_settings_icon(self):
        canvas = getattr(self, "printer_settings_button", None)
        if not canvas:
            return
        try:
            canvas.delete("all")
        except Exception:
            return
        canvas.create_oval(2, 2, 28, 28, outline=UI_COLORS["accent_hover"], width=1.5, fill=UI_COLORS["accent"])
        canvas.create_text(15, 15, text="⚙", fill="#ffffff", font=("Segoe UI", 13, "bold"))

    def _start_minimized_to_tray(self):
        if self._in_tray:
            return
        if not (PYSTRAY_AVAILABLE and PIL_AVAILABLE):
            return
        self._hide_to_tray()

    def _schedule_token_check(self):
        if self._token_check_timer:
            try:
                self.after_cancel(self._token_check_timer)
            except Exception:
                pass
            self._token_check_timer = None
        self._token_check_timer = self.after(150, self._run_token_check)

    def _schedule_crm_url_check(self):
        if self._crm_url_check_timer:
            try:
                self.after_cancel(self._crm_url_check_timer)
            except Exception:
                pass
            self._crm_url_check_timer = None
        raw_url = str(self.crm_base_url_var.get() or "").strip()
        if not raw_url:
            self._set_crm_url_status(None, "")
            return
        if not self._is_probably_complete_crm_url(raw_url):
            self._set_crm_url_status(False, "Недоступна")
            return
        self._set_crm_url_status("checking", "")
        self._crm_url_check_timer = self.after(CRM_URL_CHECK_DELAY_MS, self._run_crm_url_check)

    def _on_token_change(self):
        self._save_config()
        self._schedule_token_check()

    def _on_crm_base_url_change(self):
        self._server.set_crm_base_url(self._get_crm_base_url())
        self._save_config()
        self._schedule_crm_url_check()
        self._schedule_token_check()

    def _get_crm_base_url(self):
        return normalize_crm_base_url(self.crm_base_url_var.get())

    def _get_token(self):
        return (self.token_var.get() or "").strip()

    def _get_copies(self):
        try:
            raw = (self._copies_var.get() or "").strip()
            value = int(raw)
        except Exception:
            value = DEFAULT_CONFIG["copies"]
        return max(1, min(50, value))

    def _get_copies_raw(self):
        try:
            raw = (self._copies_var.get() or "").strip()
            if raw == "":
                return None
            value = int(raw)
        except Exception:
            return None
        return value

    def _adjust_copies(self, delta):
        raw = self._get_copies_raw()
        if raw is None or raw <= 0:
            if delta > 0:
                self._copies_var.set("1")
            else:
                self._copies_var.set("1")
            return
        next_value = max(1, min(50, raw + delta))
        self._copies_var.set(str(next_value))

    def _schedule_printer_refresh(self, delay_ms=2000):
        if self._printer_timer:
            try:
                self.after_cancel(self._printer_timer)
            except Exception:
                pass
        self._printer_timer = self.after(max(500, int(delay_ms)), self._printer_refresh_tick)

    def _printer_refresh_tick(self):
        self._printer_timer = None
        self._refresh_printer_ui()
        self._schedule_printer_refresh(2000)

    def _set_printer_status(self, connected):
        return

    def _set_printer_name(self, printer_name):
        return

    def _get_printer_display_name(self, system_name):
        system_name = str(system_name or "").strip()
        synced = getattr(self._server, "_synced_printers_by_system_name", {}) or {}
        synced_item = synced.get(system_name.lower(), {}) if system_name else {}
        display_name = str(synced_item.get("display_name") or "").strip()
        if not display_name:
            display_name = system_name
        if display_name and system_name and display_name.lower() != system_name.lower():
            return f"{display_name} ({system_name})"
        return display_name or system_name

    def _clear_printers_table(self):
        try:
            for item in self.printers_table_tree.get_children():
                self.printers_table_tree.delete(item)
        except Exception:
            pass

    def _on_printers_tree_mousewheel(self, event):
        try:
            if getattr(event, "num", None) == 4:
                delta = -1
            elif getattr(event, "num", None) == 5:
                delta = 1
            else:
                delta = -1 if getattr(event, "delta", 0) > 0 else 1
            self.printers_table_tree.yview_scroll(delta, "units")
        except Exception:
            pass

    def _on_printers_tree_motion(self, event):
        try:
            region = self.printers_table_tree.identify("region", event.x, event.y)
            column = self.printers_table_tree.identify_column(event.x)
            if region == "cell" and column == "#3":
                self.printers_table_tree.configure(cursor="hand2")
            else:
                self.printers_table_tree.configure(cursor="")
        except Exception:
            pass

    def _on_printers_tree_click(self, event):
        try:
            region = self.printers_table_tree.identify("region", event.x, event.y)
            column = self.printers_table_tree.identify_column(event.x)
            row_id = self.printers_table_tree.identify_row(event.y)
            if region == "cell" and column == "#3" and row_id:
                tags = self.printers_table_tree.item(row_id, "tags") or []
                printer_name = str(tags[1] if len(tags) > 1 else "").strip()
                if printer_name:
                    self._open_printer_settings(printer_name)
                    return "break"
        except Exception:
            pass

    def _open_printer_settings(self, printer_name):
        printer_name = str(printer_name or "").strip()
        if not printer_name:
            return
        if os.name != "nt":
            self._set_status("Настройки принтера доступны только в Windows", ok=False)
            return
        opened = False
        for cmd in (
            ["rundll32.exe", "printui.dll,PrintUIEntry", "/e", "/n", printer_name],
            ["rundll32.exe", "printui.dll,PrintUIEntry", "/p", "/n", printer_name],
        ):
            try:
                subprocess.Popen(cmd)
                opened = True
                break
            except Exception:
                continue
        if not opened:
            self._set_status("Не удалось открыть настройки принтера", ok=False)

    def _render_printers_table(self):
        self._clear_printers_table()
        if not WINDOWS_PRINTING_AVAILABLE:
            label = tk.Label(
                self.printers_table_container,
                text="Список принтеров недоступен: установите pywin32 для текущего Python",
                font=("Segoe UI", 10),
                bg=UI_COLORS["card"],
                fg=UI_COLORS["muted"],
                anchor="w",
                justify="left",
                wraplength=360
            )
            label.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
            return

        names = _list_printers()
        if not names:
            label = tk.Label(
                self.printers_table_container,
                text="Подключенные принтеры не найдены",
                font=("Segoe UI", 10),
                bg=UI_COLORS["card"],
                fg=UI_COLORS["muted"],
                anchor="w",
                justify="left",
                wraplength=360
            )
            label.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
            return

        default_name = str(getattr(self._server, "_selected_printer_system_name", "") or "").strip()
        try:
            if not default_name:
                default_name = str(win32print.GetDefaultPrinter() or "").strip()
        except Exception:
            default_name = ""

        try:
            self.printers_table_tree.configure(height=max(1, min(6, len(names))))
        except Exception:
            pass
        for row_index, name in enumerate(names):
            system_name = str(name or "").strip()
            if not system_name:
                continue
            _, is_online = _get_printer_state(system_name)
            is_default = bool(default_name and system_name.lower() == default_name.lower())
            display_name = self._get_printer_display_name(system_name)
            name_text = display_name + (" (по умолчанию)" if is_default else "")
            status_text = "🟢 Подключен" if is_online else "🔴 Отключен"
            row_tag = f"printer_{row_index}"
            self.printers_table_tree.insert(
                "",
                "end",
                iid=row_tag,
                values=(name_text, status_text, "⚙"),
                tags=("printer_row", system_name),
            )
        self.printers_table_tree.tag_configure("printer_row", foreground=UI_COLORS["text"])

        try:
            self.printers_table_tree.yview_moveto(0)
        except Exception:
            pass

    def _refresh_printer_ui(self):
        if not WINDOWS_PRINTING_AVAILABLE:
            self._render_printers_table()
            return
        self._render_printers_table()

    def _open_windows_printers(self):
        opened = False
        try:
            subprocess.Popen(["control.exe", "/name", "Microsoft.DevicesAndPrinters"])
            opened = True
        except Exception:
            pass
        if not opened:
            try:
                subprocess.Popen(["control.exe", "printers"])
                opened = True
            except Exception:
                pass
        if not opened:
            self._set_status("Не удалось открыть Устройства и принтеры", ok=False)

    def _run_token_check(self):
        self._token_check_timer = None
        token = self._get_token()
        if not token:
            self._set_token_status(None, "")
            return
        if self._crm_url_ok is False:
            self._set_token_status(False, "crm_unavailable")
            return
        crm_base_url = self._get_crm_base_url()
        check_key = (crm_base_url, token)
        if self._token_check_in_progress:
            self._pending_token_check_key = check_key
            return
        self._token_check_in_progress = True
        self._pending_token_check_key = None
        threading.Thread(
            target=self._check_token_worker,
            args=(check_key, token, crm_base_url),
            daemon=True
        ).start()

    def _check_token_worker(self, check_key, token, crm_base_url):
        ok, store_name = self._verify_token_with_crm(token, crm_base_url)
        self.after(0, lambda: self._on_token_check_done(check_key, ok, store_name))

    def _run_crm_url_check(self):
        self._crm_url_check_timer = None
        crm_base_url = str(self.crm_base_url_var.get() or "").strip()
        if not crm_base_url:
            self._set_crm_url_status(None, "")
            return
        check_key = normalize_crm_base_url(crm_base_url)
        if not self._is_probably_complete_crm_url(check_key):
            self._set_crm_url_status(False, "Недоступна")
            return
        self._crm_url_check_seq += 1
        check_seq = self._crm_url_check_seq
        self._set_crm_url_status("checking", "")
        threading.Thread(
            target=self._check_crm_url_worker,
            args=(check_seq, check_key),
            daemon=True
        ).start()

    def _check_crm_url_worker(self, check_seq, check_key):
        ok, reason = self._verify_crm_url_with_http(check_key)
        self.after(0, lambda: self._on_crm_url_check_done(check_seq, check_key, ok, reason))

    def _on_crm_url_check_done(self, check_seq, check_key, ok, reason):
        if check_seq != self._crm_url_check_seq:
            return
        self._set_crm_url_status(ok, reason)
        if self._get_token():
            self._schedule_token_check()

    def _is_probably_complete_crm_url(self, value):
        normalized = normalize_crm_base_url(value)
        try:
            parsed = urllib.parse.urlparse(normalized)
        except Exception:
            return False
        host_ascii = _crm_host_to_ascii(parsed.hostname)
        if not host_ascii:
            return False
        if host_ascii == "localhost":
            return True
        if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", host_ascii):
            return True
        if ":" in host_ascii and re.match(r"^[0-9a-f:]+$", host_ascii):
            return True
        parts = [part for part in host_ascii.split(".") if part]
        if len(parts) < 2:
            return False
        if len(parts[-1]) < 2:
            return False
        for part in parts:
            if not re.match(r"^[a-z0-9-]+$", part):
                return False
        return True

    def _verify_crm_url_with_http(self, crm_base_url):
        probe_url = build_crm_request_url(crm_base_url, "/api/print/token-info")
        req = urllib.request.Request(
            probe_url,
            method="GET",
            headers={
                "User-Agent": f"{APP_NAME}/{AGENT_VERSION}",
                "Accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
                "Cache-Control": "no-cache",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=CRM_URL_CHECK_TIMEOUT) as resp:
                body = resp.read(CRM_URL_CHECK_READ_BYTES).decode("utf-8", "ignore")
                status_code = int(getattr(resp, "status", 200) or 200)
                content_type = str(resp.headers.get("Content-Type", "") or "").lower()
        except urllib.error.HTTPError as err:
            status_code = int(getattr(err, "code", 0) or 0)
            try:
                body = err.read(CRM_URL_CHECK_READ_BYTES).decode("utf-8", "ignore")
            except Exception:
                body = ""
            content_type = str(getattr(err, "headers", {}).get("Content-Type", "") or "").lower()
        except Exception:
            return False, "Недоступна"

        normalized_body = str(body or "").strip()
        normalized_body_lc = normalized_body.lower()
        if any(marker in normalized_body_lc for marker in CRM_URL_BAD_MARKERS):
            return False, "Заглушка"

        is_json = ("application/json" in content_type) or normalized_body.startswith("{")
        if not is_json:
            return False, "Недоступна"

        try:
            data = json.loads(normalized_body) if normalized_body else {}
        except Exception:
            return False, "Недоступна"

        if status_code >= 500:
            return False, "Недоступна"

        error_code = str(data.get("error") or "").strip().upper()
        if status_code in (401, 403) and error_code in {"API_KEY_REQUIRED", "API_KEY_INVALID"}:
            return True, "Открывается"
        if data.get("ok") is True:
            return True, "Открывается"
        return False, "Недоступна"

    def _on_token_check_done(self, check_key, ok, detail):
        self._set_token_status(ok, detail)
        self._token_check_in_progress = False
        if ok is True:
            try:
                crm_base_url, token = check_key
            except Exception:
                crm_base_url, token = "", ""
            if token and crm_base_url == self._get_crm_base_url() and token == self._get_token():
                self._server.set_crm_base_url(crm_base_url)
                threading.Thread(
                    target=self._server._sync_printers,
                    args=(token, True),
                    daemon=True
                ).start()
                self._start_server_if_ready(auto=True)
        if self._pending_token_check_key and self._pending_token_check_key != check_key:
            self._run_token_check()

    def _verify_token_with_crm(self, token, crm_base_url):
        url = build_crm_request_url(crm_base_url, "/api/print/token-info")
        req = urllib.request.Request(url, method="GET", headers={"X-Api-Key": token})
        try:
            with urllib.request.urlopen(req, timeout=max(1.5, CRM_URL_CHECK_TIMEOUT + 0.5)) as resp:
                body = resp.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as err:
            status_code = int(getattr(err, "code", 0) or 0)
            if status_code in (401, 403):
                return False, "invalid_token"
            return False, "crm_unavailable"
        except Exception:
            return False, "crm_unavailable"
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}
        if not data or not data.get("ok"):
            return False, "invalid_token"
        info = data.get("data") or {}
        store_name = info.get("store_name") or info.get("storeTitle") or ""
        if info.get("store_id") and store_name:
            store_name = f"{store_name} (#{info.get('store_id')})"
        return True, store_name

    def _set_token_status(self, ok, detail):
        if ok is True:
            point_name = _ellipsis_text(detail, 44) if detail else ""
            text = f"Точка: {point_name}" if point_name else "Точка:"
            border_color = UI_COLORS["ok"]
            self._token_ok = True
        elif ok is False:
            if detail == "crm_unavailable" or self._crm_url_ok is False:
                text = self._crm_url_problem or "CRM недоступна"
            else:
                text = "Введите корректный X-Api-Key"
            border_color = UI_COLORS["error"]
            self._token_ok = False
        else:
            text = ""
            border_color = "#3a3a3a"
            self._token_ok = False

        if UI_BACKEND == "ctk":
            try:
                self.token_entry.configure(border_color=border_color)
            except Exception:
                pass
            self.store_label.configure(text=text)
            self._sync_point_tooltip(detail if ok is True else "")
        else:
            try:
                self.token_entry.configure(highlightbackground=border_color, highlightcolor=border_color)
            except Exception:
                try:
                    self.token_entry.config(highlightbackground=border_color, highlightcolor=border_color)
                except Exception:
                    pass
            self.store_label.config(text=text)
            self._sync_point_tooltip(detail if ok is True else "")

    def _sync_point_tooltip(self, detail):
        text = str(detail or "").strip()
        if not hasattr(self, "_point_tooltip"):
            self._point_tooltip = _Tooltip(self.store_label, lambda: getattr(self, "_point_tooltip_text", ""))
        self._point_tooltip_text = text

    def _set_crm_url_status(self, ok, reason):
        if ok == "checking":
            border_color = "#3a3a3a"
        elif ok is True:
            border_color = UI_COLORS["ok"]
            self._crm_url_ok = True
            self._crm_url_problem = ""
        elif ok is False:
            border_color = UI_COLORS["error"]
            self._crm_url_ok = False
            self._crm_url_problem = "CRM недоступна"
        else:
            border_color = "#3a3a3a"
            self._crm_url_ok = None
            self._crm_url_problem = ""

        if UI_BACKEND == "ctk":
            try:
                self.crm_url_entry.configure(border_color=border_color)
            except Exception:
                pass
        else:
            try:
                self.crm_url_entry.configure(highlightbackground=border_color, highlightcolor=border_color)
            except Exception:
                try:
                    self.crm_url_entry.config(highlightbackground=border_color, highlightcolor=border_color)
                except Exception:
                    pass

    def _set_status(self, text, ok=None, color=None):
        return

    def _set_running_state(self, is_running):
        self._server_running = bool(is_running)
        self._set_token_entry_enabled(True)
        return

    def _set_token_entry_enabled(self, enabled):
        state = "normal" if enabled else "normal"
        color = UI_COLORS["text"] if enabled else UI_COLORS["disabled_text"]
        for widget in (self.crm_url_entry, self.token_entry):
            entry = self._resolve_entry_widget(widget)
            try:
                entry.configure(state=state)
            except Exception:
                try:
                    entry.config(state=state)
                except Exception:
                    pass
            if UI_BACKEND == "ctk":
                try:
                    widget.configure(text_color=color)
                except Exception:
                    pass
            try:
                entry.configure(fg=color)
            except Exception:
                try:
                    entry.config(fg=color)
                except Exception:
                    pass

    def _confirm_start_without_printer(self, printer_name, printer_online):
        if printer_name and printer_online:
            return True

        if printer_name:
            problem = f"Принтер '{printer_name}' сейчас недоступен."
        else:
            problem = "Принтер по умолчанию не выбран."

        message = (
            f"{problem}\n\n"
            "Запустить агент без подключенного принтера?\n"
            "Он продолжит синхронизацию с CRM, но задания печати не смогут напечататься, "
            "пока принтер не станет доступен."
        )

        try:
            return bool(
                messagebox.askyesno(
                    "Запуск без принтера",
                    message,
                    parent=self
                )
            )
        except Exception:
            return False

    def _start_server_if_ready(self, auto=False):
        if self._server_running:
            return True
        if not self._token_ok:
            if not auto:
                if self._crm_url_ok is False:
                    self._set_status(self._crm_url_problem or "CRM недоступна", ok=False)
                    try:
                        self.crm_url_entry.focus_set()
                    except Exception:
                        pass
                else:
                    self._set_status("Введите корректный X-Api-Key", ok=False)
                    try:
                        self.token_entry.focus_set()
                    except Exception:
                        pass
            return False
        printer_name, printer_online = _get_default_printer_state()
        if not auto and not self._confirm_start_without_printer(printer_name, printer_online):
            if not printer_name:
                self._set_status("Выберите принтер по умолчанию", ok=False)
            elif not printer_online:
                self._set_status("Принтер отключен", ok=False)
            return False
        try:
            self._server.set_crm_base_url(self._get_crm_base_url())
            self._server.start()
            self._set_running_state(True)
            if not printer_name or not printer_online:
                self._set_status(
                    f"Запущен без принтера: синхронизация с {self._get_crm_base_url()}",
                    color=UI_COLORS["text"]
                )
            return True
        except Exception:
            logging.exception("Не удалось запустить сервер")
            self._set_status("Ошибка запуска", ok=False)
            return False

    def _on_start_click(self):
        self._start_server_if_ready(auto=False)

    def _on_background_click(self):
        self._hide_to_tray()

    def _schedule_ui(self, func):
        try:
            self.after(0, func)
        except Exception:
            pass

    def _create_tray_image(self):
        size = 64
        if self._icon_path and os.path.isfile(self._icon_path):
            try:
                img = Image.open(self._icon_path).convert("RGBA")
                return img.resize((size, size), Image.LANCZOS)
            except Exception:
                pass
        img = Image.new("RGB", (size, size), UI_COLORS["accent"])
        draw = ImageDraw.Draw(img)
        draw.rectangle((10, 10, 54, 54), outline="#ffffff", width=4)
        draw.rectangle((22, 24, 42, 44), fill="#ffffff")
        return img

    def _hide_to_tray(self):
        if self._in_tray:
            return
        if not (PYSTRAY_AVAILABLE and PIL_AVAILABLE):
            return

        def do_hide():
            try:
                self.withdraw()
                self._set_status("В фоне", ok=None)
            except Exception:
                pass

        self._schedule_ui(do_hide)

        image = self._create_tray_image()
        menu = pystray.Menu(
            pystray.MenuItem("Открыть", lambda icon, item: self._restore_from_tray(), default=True),
            pystray.MenuItem("Выход", lambda icon, item: self._exit_from_tray())
        )
        self._tray_icon = pystray.Icon("PrintServer", image, APP_NAME, menu)
        self._in_tray = True

        def run_icon():
            try:
                self._tray_icon.run()
            finally:
                self._in_tray = False

        self._tray_thread = threading.Thread(target=run_icon, daemon=True)
        self._tray_thread.start()

    def _stop_tray_icon(self):
        if self._tray_icon:
            try:
                self._tray_icon.stop()
            except Exception:
                pass
        self._tray_icon = None
        self._tray_thread = None

    def _restore_from_tray(self):
        def do_restore():
            try:
                self.deiconify()
                self.lift()
                self.focus_force()
                self._set_running_state(self._server_running)
            except Exception:
                pass
        self._schedule_ui(do_restore)

    def _exit_from_tray(self):
        self._stop_tray_icon()
        self._schedule_ui(lambda: self._on_close(force_exit=True))

    def _on_close(self, force_exit=False):
        if not force_exit and PYSTRAY_AVAILABLE and PIL_AVAILABLE:
            self._hide_to_tray()
            return
        self._stop_tray_icon()
        if self._printer_timer:
            try:
                self.after_cancel(self._printer_timer)
            except Exception:
                pass
            self._printer_timer = None
        try:
            self._server.stop()
        except Exception:
            pass
        self.destroy()


if __name__ == "__main__":
    app = ConfigApp()
    app.mainloop()
