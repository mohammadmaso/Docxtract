import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-production")
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "inertia",
    "django_vite",
    "django_celery_results",
    # Local apps
    "documents",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "inertia.middleware.InertiaMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "parser_db"),
        "USER": os.environ.get("DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "postgres"),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = []

# CSRF Settings
CSRF_TRUSTED_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"]
CSRF_COOKIE_HTTPONLY = False  # Allow JavaScript to read the cookie

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static & Media files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
_frontend_dist = BASE_DIR / "frontend" / "dist"
STATICFILES_DIRS = [_frontend_dist] if _frontend_dist.is_dir() else []
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Inertia ---
INERTIA_LAYOUT = "base.html"
INERTIA_SSR_ENABLED = False

# --- Django Vite ---
DJANGO_VITE = {
    "default": {
        "dev_mode": DEBUG,
        "dev_server_host": "localhost",
        "dev_server_port": 5173,
        "manifest_path": BASE_DIR / "frontend" / "dist" / "manifest.json",
        "static_url_prefix": "",
    }
}

# --- Celery (PostgreSQL broker via SQLAlchemy) ---
_db_user = os.environ.get("DB_USER", "postgres")
_db_pass = os.environ.get("DB_PASSWORD", "postgres")
_db_host = os.environ.get("DB_HOST", "localhost")
_db_port = os.environ.get("DB_PORT", "5432")
_db_name = os.environ.get("DB_NAME", "parser_db")
CELERY_BROKER_URL = f"sqla+postgresql://{_db_user}:{_db_pass}@{_db_host}:{_db_port}/{_db_name}"
CELERY_RESULT_BACKEND = "django-db"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 600  # 10 minutes
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# --- LLM API Keys ---
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# --- File upload ---
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024  # 50 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024
