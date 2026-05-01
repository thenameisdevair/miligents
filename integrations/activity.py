"""
integrations/activity.py

Lightweight decorator for emitting live-activity events around tool calls.

Wrap a CrewAI @tool function with @emit(...) and a tool_call event is
written before invocation, then a tool_result event after a successful
return, or an error event on exception. Activity logging must never
break tool execution; all writes go through the fail-silent
write_activity() helper in state_writer.py.

Usage:

    @tool("web_search")
    @emit(agent_id="originator", summary_fn=lambda a, k: f"searching: {a[0] if a else ''}")
    def web_search_tool(query: str) -> str:
        ...
"""

from functools import wraps
from typing import Callable

from integrations.state_writer import write_activity


def emit(
    agent_id: str,
    summary_fn: Callable | None = None,
    result_summary_fn: Callable | None = None,
):
    """
    Decorator factory that emits activity events around a tool call.

    Args:
        agent_id: Which agent owns this tool — 'originator', 'specialist',
                  or 'execution'. Used as the activity row's agent_id.
        summary_fn: Optional (args, kwargs) -> str to build a richer
                    tool_call summary. Defaults to the function name.
        result_summary_fn: Optional (result, args, kwargs) -> str to
                           build a richer tool_result summary. Defaults
                           to a truncated repr of the return value.

    Returns:
        A decorator that wraps the target function.
    """

    def decorator(fn):
        tool_name = fn.__name__

        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                summary = (
                    summary_fn(args, kwargs)
                    if summary_fn
                    else f"calling {tool_name}"
                )
            except Exception:
                summary = f"calling {tool_name}"
            write_activity(agent_id, "tool_call", summary)

            try:
                result = fn(*args, **kwargs)
            except Exception as e:
                write_activity(
                    agent_id,
                    "error",
                    f"{tool_name} raised {type(e).__name__}: {e}"[:140],
                )
                raise

            try:
                if result_summary_fn:
                    rsum = result_summary_fn(result, args, kwargs)
                else:
                    s = str(result) if result is not None else ""
                    rsum = f"{tool_name} returned: {s[:80]}"
                write_activity(agent_id, "tool_result", rsum)
            except Exception:
                write_activity(agent_id, "tool_result", f"{tool_name} returned")

            return result

        return wrapper

    return decorator
