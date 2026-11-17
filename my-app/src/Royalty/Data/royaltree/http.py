"""All pipeline HTTP goes through here: one session, the project User-Agent,
a timeout on every request, back-off on 429/5xx/maxlag, and request counters.

Wikimedia etiquette (see report): identify the client with a URL in the
User-Agent, send requests serially, pass ``maxlag`` to the Action API and wait
``Retry-After`` seconds when told to. WDQS POST (``royaltree/wdqs.py``) uses
this same session and the same back-off. The query service throttles with 429
and ``Retry-After`` (User Manual, query limits); it does not speak Action API
maxlag, but a response that carries the header still waits.
"""
import sys
import time
from collections import Counter
from urllib.parse import urlsplit

import requests

USER_AGENT = "RoyalTreeBot/1.0 (+https://makoa.link)"
DEFAULT_TIMEOUT = (10, 60)  # (connect, read) seconds
MAX_RETRIES = 6
MAXLAG = 5  # seconds; the value Wikimedia recommends for bots
MAX_WAIT = 120
# Wikidata's lag (which includes query-service lag) can sit above 5s for
# minutes; maxlag waits get their own budget so a lagged server delays the run
# (roughly 15 min at most) instead of failing it.
MAXLAG_RETRIES = 20


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


def configure(offline=False, max_requests=None, maxlag=None):
    global MAXLAG
    _state["offline"] = offline
    _state["max_requests"] = max_requests
    if maxlag is not None:
        MAXLAG = maxlag


def is_offline():
    return _state["offline"]


def _session():
    if _state["session"] is None:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        _state["session"] = s
    return _state["session"]


def _wait(seconds, why=""):
    seconds = min(max(seconds, 0), MAX_WAIT)
    print(f"[royaltree] waiting {seconds:.0f}s ({why})", file=sys.stderr, flush=True)
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
    return _request("get", url, params=params, headers=headers, timeout=timeout,
                    retries=retries, **kwargs)


def post(url, data=None, params=None, headers=None, timeout=None, retries=MAX_RETRIES, **kwargs):
    """POST with the project UA and a timeout. Same back-off and counters as :func:`get`."""
    return _request("post", url, params=params, data=data, headers=headers,
                    timeout=timeout, retries=retries, **kwargs)


def _request(method, url, *, params=None, data=None, headers=None, timeout=None,
             retries=MAX_RETRIES, **kwargs):
    if _state["offline"]:
        raise NetworkDisabled(f"offline run attempted a request: {url}")
    hdrs = dict(headers or {})
    hdrs["User-Agent"] = USER_AGENT  # never let a caller drop or change it
    host = urlsplit(url).netloc
    delay = 2.0
    lag_delay = 5.0
    lag_waits = 0
    last = None
    attempt = 0
    call = getattr(_session(), method)
    while attempt < retries:
        attempt += 1
        cap = _state["max_requests"]
        if cap is not None and STATS.requests >= cap:
            raise RequestBudgetExceeded(f"--max-requests {cap} reached; rerun to resume")
        STATS.requests += 1
        STATS.by_host[host] += 1
        try:
            resp = call(url, params=params, data=data, headers=hdrs,
                        timeout=timeout or DEFAULT_TIMEOUT, **kwargs)
        except requests.RequestException as exc:
            STATS.network_errors += 1
            last = exc
            wait, why = delay, f"network error: {type(exc).__name__}"
            delay = min(delay * 2, 60)
        else:
            if resp.status_code == 429:
                STATS.status_429 += 1
                last = why = "HTTP 429"
                wait = _retry_after(resp, delay)
                delay = min(delay * 2, 60)
            elif resp.headers.get("MediaWiki-API-Error") == "maxlag":
                STATS.maxlag += 1
                last, why = "maxlag", "maxlag: server lagged"
                if lag_waits < MAXLAG_RETRIES:
                    lag_waits += 1
                    attempt -= 1  # maxlag has its own budget
                wait = max(_retry_after(resp, 5), lag_delay)
                lag_delay = min(lag_delay * 1.5, 60)
            elif resp.status_code >= 500:
                STATS.server_errors += 1
                last = why = f"HTTP {resp.status_code}"
                wait = _retry_after(resp, delay)
                delay = min(delay * 2, 60)
            else:
                return resp
        if attempt >= retries:
            break  # no point waiting before giving up
        if wait > MAX_WAIT:
            raise FetchError(f"{why}: server asked for {wait:.0f}s, more than the "
                             f"{MAX_WAIT}s this client waits: {url}")
        _wait(wait, why)
    raise FetchError(f"giving up after {retries} attempts ({last}): {url}")


def get_json(url, params=None, **kwargs):
    resp = get(url, params=params, **kwargs)
    resp.raise_for_status()
    return resp.json()
