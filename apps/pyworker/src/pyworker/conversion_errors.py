class EdenFailure(Exception):
    def __init__(self, stage: str, status: int = 502, *, reason: str | None = None):
        super().__init__(stage)
        self.stage = stage
        self.status = status
        self.reason = reason
        self.phase: str | None = None
