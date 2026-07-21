#!/bin/sh

echo "Running migrations..."
python manage.py migrate

# Esto revisará si ya hay datos, si no, los crea.
echo "Seeding database..."
python manage.py seed_database

echo "Starting server..."
python manage.py runserver 0.0.0.0:8000