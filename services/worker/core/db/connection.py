import psycopg2
from core.configs.env import DATABASE_URL


def db_get_connection():
    return psycopg2.connect(DATABASE_URL)
