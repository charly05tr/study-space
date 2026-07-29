from django.db import migrations, models


# Tipos que dejaron de indexarse al pasar a quedarnos solo con el bloque mas
# interno. Congelados aca a proposito: una migracion describe un momento de la
# historia, no debe seguir a INDEXED_TYPES si esa lista cambia mañana.
CONTAINER_TYPES = ['bulletList', 'orderedList', 'listItem', 'blockquote']


def clean(apps, schema_editor):
    """Saca del mapa los bloques que el indice ya no produce.

    Sin esto la proxima sincronizacion los marcaria con deleted_at y el grafo
    los dibujaria como huerfanos: el usuario terminaria viendo MAS ruido que
    antes, y en gris.

    Dos destinos distintos segun si alguien penso algo sobre ellos:

    - sin relaciones -> se borran. No aportan nada y nadie los referencia.
    - con relaciones -> se esconden. Borrarlos arrastraria las aristas por
      cascada, y una relacion es lo que el usuario penso; vale mas que el
      parrafo vacio al que apunta.
    """
    Block = apps.get_model('studyspace', 'Block')
    BlockLink = apps.get_model('studyspace', 'BlockLink')

    noisy = Block.objects.filter(
        models.Q(block_type__in=CONTAINER_TYPES) | models.Q(text='')
    )

    linked_ids = set(
        BlockLink.objects.filter(source__in=noisy).values_list('source_id', flat=True)
    ) | set(
        BlockLink.objects.filter(target__in=noisy).values_list('target_id', flat=True)
    )

    noisy.filter(pk__in=linked_ids).update(excluded_from_map=True)
    noisy.exclude(pk__in=linked_ids).delete()

    # La huella se recalcula desde la extraccion nueva, asi que cambia sola y la
    # sincronizacion no se saltea. Se limpia igual para que un documento que ya
    # no produce ningun bloque tampoco quede con la huella vieja.
    apps.get_model('studyspace', 'Note').objects.update(blocks_hash='')


def noop(apps, schema_editor):
    """Irreversible por naturaleza: lo borrado no se puede adivinar.

    Volver atras solo necesita revertir el codigo — la proxima escritura de cada
    nota reconstruye su indice, porque Block es derivado.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('studyspace', '0012_block_excluded_from_map'),
    ]

    operations = [
        migrations.RunPython(clean, noop),
    ]
