import asyncio


class Result:
  def __init__(self, rows=None): self.rows = rows or []
  def mappings(self): return self
  def first(self): return self.rows[0] if self.rows else None
  def all(self): return self.rows


class Connection:
  def __init__(self, results): self.results, self.statements = iter(results), []
  async def __aenter__(self): return self
  async def __aexit__(self, *_): return None
  async def execute(self, statement, parameters=None):
    self.statements.append((str(statement), parameters))
    return next(self.results)


class Engine:
  def __init__(self, connection): self.connection = connection
  def connect(self): return self.connection


def test_panel_course_queries_parameterize_filters_and_constrain_authorized_courses() -> None:
  from proctoring.repositories.panel import SqlPanelRepository
  connection = Connection([Result([{"total": 1}]), Result([{"moodle_course_id": "course-a", "name": "Law", "attempt_count": 1, "open_alert_count": 0}])])
  repository = SqlPanelRepository(Engine(connection))

  result = asyncio.run(repository.list_courses({"courseIds": ["course-a"], "institutional": False}, {"query": "law%_", "page": 1, "pageSize": 25}))

  assert result["courses"][0]["id"] == "course-a"
  sql, parameters = connection.statements[0]
  assert "sessions.moodle_course_id IN (:course_id_0)" in sql
  assert parameters["course_id_0"] == "course-a"
  assert parameters["search"] == "%law\\%\\_%"


def test_empty_panel_scope_fails_closed_without_running_a_database_query() -> None:
  from proctoring.repositories.panel import SqlPanelRepository
  connection = Connection([])

  result = asyncio.run(SqlPanelRepository(Engine(connection)).list_sessions({"courseIds": [], "institutional": False}))

  assert result == []
  assert connection.statements == []
