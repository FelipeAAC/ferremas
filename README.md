# Proyecto Página Web Ferremas (Frontend Django)

## Descripción

Este proyecto es la interfaz de usuario (frontend) para el sistema Ferremas, desarrollada con Django. Se encarga de la presentación y la interacción con el usuario, consumiendo datos y servicios de APIs backend:

* Autenticación de usuarios
* Gestión de productos y datos (CRUD)
* Procesamiento de pagos (PayPal)
* Conversión de moneda (API Banco Central)

## Requisitos Previos

* Python (versión 3.8 o superior)
* pip (gestor de paquetes de Python)

## Instalación y Configuración

Sigue estos pasos para poner en marcha el proyecto en tu entorno local:

1.  **Clonar el Repositorio:**

    ```bash
    git clone <URL_DEL_REPOSITORIO_AQUI>
    cd ferremas
    ```
    Si ya tienes los archivos, simplemente navega a la carpeta raíz del proyecto `ferremas` (donde se encuentra el archivo `manage.py`).

2.  **Crear y Activar un Entorno Virtual:**

    ```bash
    # Desde la raíz del proyecto (donde está manage.py)
    python -m venv venv
    ```
    Para activar el entorno virtual:
    * En Windows (CMD/PowerShell):
        ```bash
        .\venv\Scripts\activate
        ```
    * En macOS/Linux (bash/zsh):
        ```bash
        source venv/bin/activate
        ```
    *(Deberías ver `(venv)` al inicio del prompt de tu terminal).*

3.  **Instalar Dependencias:**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Aplicar Migraciones de Base de Datos:**

    ```bash
    python manage.py migrate
    ```

## Ejecutar la Aplicación

Una vez completada la instalación y configuración:

1.  **Iniciar el Servidor de Desarrollo Django:**
    ```bash
    python manage.py createsuperuser
    Admin Admin
    python manage.py migrate
    python manage.py runserver
    ```

2.  **Abrir en el Navegador:**
    Abre tu navegador web y ve a `http://127.0.0.1:8000/` (o el puerto que hayas especificado).
