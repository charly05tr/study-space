"""In-process replacement for Celery beat in desktop mode.

Runs the tasks listed in settings.CELERY_BEAT_SCHEDULE on their interval with
an APScheduler BackgroundScheduler. CELERY_TASK_ALWAYS_EAGER makes each task
run (and any `.delay()` inside it) synchronously in the scheduler thread.
"""

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from django.conf import settings

logger = logging.getLogger(__name__)

STARTUP_DELAY_SECONDS = 10


def _run_task(task_name: str):
    from config.celery import app

    try:
        app.tasks[task_name]()
    except Exception:
        logger.exception('Scheduled task %s failed', task_name)


def build_scheduler() -> BackgroundScheduler:
    from config.celery import app

    # Registers the @shared_task functions of every installed app.
    app.loader.import_default_modules()

    scheduler = BackgroundScheduler(timezone=settings.TIME_ZONE)
    first_run = datetime.now() + timedelta(seconds=STARTUP_DELAY_SECONDS)

    for name, entry in settings.CELERY_BEAT_SCHEDULE.items():
        interval = entry['schedule']
        seconds = interval.total_seconds() if hasattr(interval, 'total_seconds') else float(interval)
        scheduler.add_job(
            _run_task,
            'interval',
            args=[entry['task']],
            seconds=seconds,
            id=name,
            next_run_time=first_run,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=60,
        )

    return scheduler
