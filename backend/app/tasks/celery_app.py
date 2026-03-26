from celery import Celery

from app.core.config import get_settings


settings = get_settings()

celery_app = Celery(
    "dynamic_manga_studio",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.task_default_queue = "manga_drama"
celery_app.conf.task_always_eager = settings.celery_task_always_eager
celery_app.conf.task_eager_propagates = True
celery_app.conf.imports = ("app.tasks.job_runner",)
