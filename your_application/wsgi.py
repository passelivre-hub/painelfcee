from app import app as flask_app

# Gunicorn espera encontrar um callable chamado "application" por padrão.
application = flask_app

# Alias opcional para compatibilidade com ferramentas que buscam `app`.
app = flask_app
