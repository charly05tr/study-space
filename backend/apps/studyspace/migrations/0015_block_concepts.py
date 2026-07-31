import django.db.models.deletion
from django.db import migrations, models


# Congelados a proposito, igual que CONTAINER_TYPES en 0013: una migracion
# describe un momento de la historia. Si mañana un tipo nuevo pasa a anclar
# conceptos, esta migracion tiene que seguir repartiendo como se repartia hoy.
SELF_ANCHORING_TYPES = {'heading', 'annotation'}


def assign(apps, schema_editor):
    """Reparte los bloques existentes entre conceptos.

    Se hace aca y no dejando que lo haga la proxima sincronizacion — que es lo
    que hizo 0013 limpiando blocks_hash — porque el reparto NO depende del
    documento: con concept en NULL para todos, el grafo queda completamente
    vacio hasta que el usuario vuelva a escribir en cada una de sus notas.

    Copia de assign_concepts (services/block_service.py) reducida a lo que hay
    en la base en este punto. Ver alla el razonamiento.
    """
    Block = apps.get_model('studyspace', 'Block')
    BlockLink = apps.get_model('studyspace', 'BlockLink')

    note_ids = Block.objects.values_list('note_id', flat=True).distinct()

    linked = set()
    for source_id, target_id in BlockLink.objects.values_list('source_id', 'target_id'):
        linked.add(source_id)
        linked.add(target_id)

    for note_id in note_ids:
        blocks = list(Block.objects.filter(note_id=note_id).order_by('position'))
        open_headings = []
        changed = []

        for block in blocks:
            if block.deleted_at is not None:
                # Fuera del documento: o es un nodo suelto porque alguien lo
                # relaciono, o no esta en el mapa.
                concept_id = (
                    block.pk
                    if block.pk in linked and not block.excluded_from_map
                    else None
                )
            elif block.excluded_from_map:
                concept_id = None
            elif block.block_type == 'heading':
                # heading_level lo llena la primera sincronizacion; hasta
                # entonces todos los titulos valen 1 y quedan al mismo nivel,
                # que es exactamente como se comportaban antes de este cambio.
                level = block.heading_level or 1
                while open_headings and open_headings[-1][0] >= level:
                    open_headings.pop()
                open_headings.append((level, block.pk))
                concept_id = block.pk
            elif block.block_type in SELF_ANCHORING_TYPES or block.promoted:
                concept_id = block.pk
            else:
                concept_id = open_headings[-1][1] if open_headings else None

            if block.concept_id != concept_id:
                block.concept_id = concept_id
                changed.append(block)

        if changed:
            Block.objects.bulk_update(changed, ['concept'])

    # La huella cambia igual porque heading_level entra en ella, pero se limpia
    # para que el proximo guardado reindexe seguro y llene los niveles.
    apps.get_model('studyspace', 'Note').objects.update(blocks_hash='')


def unassign(apps, schema_editor):
    """Revertir solo tiene que dejar el esquema atras; el reparto es derivado."""


class Migration(migrations.Migration):

    dependencies = [
        ('studyspace', '0014_source_converter_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='block',
            name='heading_level',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='block',
            name='promoted',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='block',
            name='concept',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='members',
                to='studyspace.block',
            ),
        ),
        migrations.RunPython(assign, unassign),
    ]
