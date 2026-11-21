"""Single-process runner; DEV watches source only, never environments or caches."""

import copy
import logging
import os
import sys
import threading

import uvicorn

from pyworker.config import Settings


def main() -> None:
    settings = Settings.from_environment()
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(levelname)s %(name)s %(message)s"
    )
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    log_config["loggers"]["pyworker"] = {
        "handlers": ["default"],
        "level": settings.log_level.upper(),
        "propagate": False,
    }
    config = uvicorn.Config(
        "pyworker.main:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=False,
        workers=1,
        access_log=False,
        server_header=False,
        proxy_headers=False,
        # Psycopg async connections require SelectorEventLoop on Windows.
        loop="asyncio:SelectorEventLoop",
        log_level=settings.log_level,
        log_config=log_config,
        limit_concurrency=32,
        timeout_keep_alive=5,
        timeout_graceful_shutdown=settings.task_timeout + 2,
    )
    server = uvicorn.Server(config)
    if os.environ.get("PYWORKER_PARENT_CONTROL") == "stdin":
        # Windows TerminateProcess cannot drain ASGI work. The owning launcher
        # requests normal Uvicorn shutdown over its private stdin pipe instead.
        def parent_control() -> None:
            for line in sys.stdin:
                if line.strip() == "shutdown":
                    break
            server.should_exit = True

        threading.Thread(target=parent_control, daemon=True).start()
    try:
        server.run()
    except KeyboardInterrupt:
        # Uvicorn can re-raise SIGINT after completing its shutdown.
        pass


if __name__ == "__main__":
    main()
