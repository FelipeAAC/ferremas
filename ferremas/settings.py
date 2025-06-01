from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-lix0)n76lkk1^d0vrzd=_su_#d4!5!l+rl7+n$_7)uzc4ods#&' #

DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ferremas.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'django.template.context_processors.media',
            ],
        },
    },
]

WSGI_APPLICATION = 'ferremas.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'es-cl'

TIME_ZONE = 'America/Santiago'

USE_I18N = True

USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'core/static/'),
]

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'core', 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID', 'AYOlbCxD6Gd60gXLsP5SkArDzzM5ZUAeComtgqaKVqj5_MVhv6TeYL2dChy-g8TqxTDsL3wumWLMcnTg')
PAYPAL_CLIENT_SECRET = os.environ.get('PAYPAL_CLIENT_SECRET', 'EBVvvVmJQRlxx4O2TV3BdpaySik2cK2Fl3LNbPtkrEFO4Cci-TM6oNNjRnpZbaJmA_GFQB4wCouD2oum')
PAYPAL_MODE = os.environ.get('PAYPAL_MODE', 'sandbox')

if PAYPAL_MODE == 'sandbox':
    PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com'
else:
    PAYPAL_API_BASE_URL = 'https://api-m.paypal.com'

API_CRUD_BASE_URL = "http://127.0.0.1:8001"
API_AUTH_BASE_URL = "http://127.0.0.1:8002"
