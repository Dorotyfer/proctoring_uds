"""Sanitized operational failures shared by model adapters and workers."""


class AnalysisUnavailable(RuntimeError):
  def __init__(self, code: str = "analysis_unavailable") -> None:
    self.code = code if _safe_code(code) else "analysis_unavailable"
    super().__init__("Analysis unavailable")


def _safe_code(value: str) -> bool:
  return (
    isinstance(value, str)
    and value.isascii()
    and len(value) <= 64
    and value.replace("_", "").isalnum()
  )
