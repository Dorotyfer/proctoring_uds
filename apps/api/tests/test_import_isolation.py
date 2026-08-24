import os
from pathlib import Path
import subprocess
import sys


def test_api_and_worker_package_imports_do_not_import_model_runtimes() -> None:
  api_root = Path(__file__).parents[1]
  environment = os.environ.copy()
  environment["PYTHONPATH"] = str(api_root / "src")
  script = """
import sys
import proctoring.main
import proctoring.worker_main
import proctoring.model_runtime
for forbidden in ('deepface', 'tensorflow', 'torch', 'torchvision', 'cv2'):
  assert forbidden not in sys.modules, forbidden
"""

  completed = subprocess.run(
    [sys.executable, "-c", script], cwd=api_root, env=environment,
    capture_output=True, text=True, timeout=30, check=False
  )

  assert completed.returncode == 0, completed.stderr
