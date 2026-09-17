"""Bounded, shared worker pool; timeouts do not create unbounded threads/queues."""
from concurrent.futures import Future, ThreadPoolExecutor
from threading import BoundedSemaphore

_pool = ThreadPoolExecutor(max_workers=12, thread_name_prefix="clinical-role")
_slots = BoundedSemaphore(12)


def submit(call, *args, **kwargs) -> Future:
    if not _slots.acquire(blocking=False):
        raise TimeoutError("Role capacity exhausted")
    try:
        future = _pool.submit(call, *args, **kwargs)
    except Exception:
        _slots.release()
        raise
    future.add_done_callback(lambda _: _slots.release())
    return future


def bounded(call, timeout, *args, **kwargs):
    future = submit(call, *args, **kwargs)
    try:
        return future.result(timeout=max(.001, timeout))
    finally:
        future.cancel()
