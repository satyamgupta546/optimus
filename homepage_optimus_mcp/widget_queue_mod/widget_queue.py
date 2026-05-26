"""
Global Widget Queue — all widget creations go through a single queue.
1 widget at a time. 200ms gap between API calls.
"""

import asyncio
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class QueueItem:
    id: str
    user_email: str
    widget_data: dict
    callback: Callable | None = None
    status: str = "queued"  # queued, processing, done, failed, cancelled
    result: dict = field(default_factory=dict)
    position: int = 0


class WidgetQueue:
    def __init__(self):
        self._queue: deque[QueueItem] = deque()
        self._processing = False
        self._current: QueueItem | None = None
        self._lock = asyncio.Lock()

    async def add(self, user_email: str, widget_data: dict) -> QueueItem:
        """Add widget to queue. Returns queue item with position."""
        item = QueueItem(
            id=str(uuid.uuid4()),
            user_email=user_email,
            widget_data=widget_data,
        )

        async with self._lock:
            self._queue.append(item)
            item.position = len(self._queue)

        # Start processing if not already running
        if not self._processing:
            asyncio.create_task(self._process_queue())

        return item

    async def get_position(self, item_id: str) -> dict:
        """Get current queue position for an item."""
        async with self._lock:
            for i, item in enumerate(self._queue):
                if item.id == item_id:
                    return {"position": i + 1, "total": len(self._queue), "status": item.status}

            if self._current and self._current.id == item_id:
                return {"position": 0, "total": len(self._queue), "status": "processing"}

        return {"error": "Item not found in queue"}

    async def cancel(self, item_id: str) -> dict:
        """Cancel a queued item."""
        async with self._lock:
            for item in self._queue:
                if item.id == item_id:
                    item.status = "cancelled"
                    self._queue.remove(item)
                    return {"status": "cancelled", "message": "Widget creation cancelled."}

            if self._current and self._current.id == item_id:
                self._current.status = "cancelled"
                return {"status": "cancelling", "message": "Cancelling in-progress widget. Will report completed steps."}

        return {"error": "Item not found in queue"}

    async def _process_queue(self):
        """Process queue items one by one."""
        self._processing = True

        while self._queue:
            async with self._lock:
                if not self._queue:
                    break
                self._current = self._queue.popleft()
                self._current.status = "processing"

            if self._current.status == "cancelled":
                continue

            try:
                # TODO: Execute widget creation (7-step flow)
                # This will be wired to the actual creation logic
                self._current.status = "done"
                self._current.result = {"message": "Widget created successfully"}
            except Exception as e:
                self._current.status = "failed"
                self._current.result = {"error": str(e)}

            # 200ms gap before next widget
            await asyncio.sleep(0.2)

        self._processing = False
        self._current = None

    @property
    def queue_size(self) -> int:
        return len(self._queue)

    @property
    def is_processing(self) -> bool:
        return self._processing


# Global singleton
widget_queue = WidgetQueue()
