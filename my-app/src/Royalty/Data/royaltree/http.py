"""All pipeline HTTP goes through here: one session, the project User-Agent,
a timeout on every request, back-off on 429/5xx/maxlag, and request counters.

Wikimedia etiquette (see report): identify the client with a URL in the
User-Agent, send requests serially, pass ``maxlag`` to the Action API and wait
``Retry-After`` seconds when told to.
"""
import time
from collections import Counter
from urllib.parse import urlsplit

import requests

USER_AGENT = "RoyalTreeBot/1.0 (+https://makoa.link)"
DEFAULT_TIMEOUT = (10, 60)  # (connect, read) seconds
MAX_RETRIES = 6
MAXLAG = 5  # seconds; the value Wikimedia recommends for bots
MAX_WAIT = 120


class NetworkDisabled(RuntimeError):
    """A request was attempted while the run is offline."""


class RequestBudgetExceeded(RuntimeError):
    """The run hit its --max-requests cap."""


class FetchError(RuntimeError):
    """A request still failed after every retry."""


class Stats:
    def __init__(self):
        self.reset()

    def reset(self):
        self.requests = 0
        self.by_host = Counter()
        self.status_429 = 0
        self.maxlag = 0
        self.server_errors = 0
        self.network_errors = 0
        self.wait_seconds = 0.0

    def as_dict(self):
        return {
            "requests": self.requests,
            "by_host": dict(sorted(self.by_host.items())),
            "429s": self.status_429,
            "maxlag_waits": self.maxlag,
            "5xx": self.server_errors,
            "network_errors": self.network_errors,
            "wait_seconds": round(self.wait_seconds, 1),
        }


STATS = Stats()
_state = {"offline": False, "max_requests": None, "session": None}
_sleep = time.sleep  # replaced in tests


def configure(offline=False, max_requests=None):
    _state["offline"] = offline
    _state["max_requests"] = max_requests


def is_offline():
    return _state["offline"]


def _session():
    if _state["session"] is None:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        _state["session"] = s
    return _state["session"]


def _wait(seconds):
    seconds = min(max(seconds, 0), MAX_WAIT)
    STATS.wait_seconds += seconds
    _sleep(seconds)


def _retry_after(resp, default):
    try:
        return float(resp.headers.get("Retry-After", default))
    except (TypeError, ValueError):
        return default


def get(url, params=None, headers=None, timeout=None, retries=MAX_RETRIES, **kwargs):
    """GET with the project UA and a timeout. Returns the final Response
    (callers decide what a 4xx means); raises FetchError after ``retries``."""
    if _state["offline"]:
        raise NetworkDisabled(f"offline run attempted a request: {url}")
    hdrs = dict(headers or {})
    hdrs["User-Agent"] = USER_AGENT  # never let a caller drop or change it
    host = urlsplit(url).netloc
    delay = 2.0
    last = None
    for _ in range(retries):
        cap = _state["max_requests"]
        if cap is not None and STATS.requests >= cap:
            raise RequestBudgetExceeded(f"--max-requests {cap} reached; rerun to resume")
        STATS.requests += 1
        STATS.by_host[host] += 1
        try:
            resp = _session().get(url, params=params, headers=hdrs,
                                  timeout=timeout or DEFAULT_TIMEOUT, **kwargs)
        except requests.RequestException as exc:
            STATS.network_errors += 1
            last = exc
            _wait(delay)
            delay = min(delay * 2, 60)
            continue
        if resp.status_code == 429:
            STATS.status_429 += 1
            last = f"HTTP 429"
            _wait(_retry_after(resp, delay))
            delay = min(delay * 2, 60)
            continue
        if resp.headers.get("MediaWiki-API-Error") == "maxlag":
            STATS.maxlag += 1
            last = "maxlag"
            _wait(_retry_after(resp, 5))
            continue
        if resp.status_code >= 500:
            STATS.server_errors += 1
            last = f"HTTP {resp.status_code}"
            _wait(_retry_after(resp, delay))
            delay = min(delay * 2, 60)
            continue
        return resp
    raise FetchError(f"giving up after {retries} attempts ({last}): {url}")


def get_json(url, params=None, **kwargs):
    resp = get(url, params=params, **kwargs)
    resp.raise_for_status()
    return resp.json()
