import asyncio

from proctoring.repositories.sface import SqlSFaceProfileRepository
from proctoring.services.vision import DescriptorCipher


class Result:
  def __init__(self, rows=(), rowcount=1): self.rows = list(rows); self.rowcount = rowcount
  def mappings(self): return self
  def first(self): return self.rows[0] if self.rows else None


class Context:
  def __init__(self, connection): self.connection = connection
  async def __aenter__(self): return self.connection
  async def __aexit__(self, *_): return None


class Connection:
  def __init__(self, results): self.results = iter(results); self.statements = []
  async def execute(self, statement, parameters=None): self.statements.append((str(statement), parameters)); return next(self.results)


class Engine:
  def __init__(self, results): self.connection = Connection(results)
  def begin(self): return Context(self.connection)


def test_sface_profile_replacement_revokes_active_history_before_inserting_new_version() -> None:
  encrypted = DescriptorCipher(b"b" * 32).encrypt((1.0, 0.0))
  row = {
    "id": "new-profile", "moodle_user_id": "student-1", "algorithm": "SFace",
    "descriptor_ciphertext": encrypted.ciphertext, "descriptor_length": 2,
    "encryption_iv": encrypted.iv, "encryption_tag": encrypted.tag,
    "enrollment_version": 4, "status": "active", "consent_version": "biometric-v2"
  }
  engine = Engine([Result([{"highest_version": 3}]), Result(), Result(), Result([row])])
  repository = SqlSFaceProfileRepository(engine)

  profile = asyncio.run(repository.replace_active({
    "moodleUserId": "student-1", "algorithm": "SFace", "encryptedDescriptor": encrypted,
    "descriptorLength": 2, "enrollmentVersion": 4, "consentVersion": "biometric-v2"
  }))

  statements = [text for text, _ in engine.connection.statements]
  assert "FOR UPDATE" in statements[0]
  assert "status = 'revoked'" in statements[1]
  assert "INSERT INTO proctoring_sface_profiles" in statements[2]
  assert profile["enrollmentVersion"] == 4
  assert profile["algorithm"] == "SFace"
