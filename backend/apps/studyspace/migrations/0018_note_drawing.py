from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('studyspace', '0017_notereview'),
    ]

    operations = [
        migrations.AddField(
            model_name='note',
            name='drawing',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
