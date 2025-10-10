# worker.py
"""
Celery configuration for AI Plagiarism Detection service.
"""

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

celery = Celery(
    "ai_tasks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

print("✅ Celery worker initialized with Redis broker")
