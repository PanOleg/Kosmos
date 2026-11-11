# Збирає й експортує всі пустельні моделі без інтерфейсу:
#   blender --background --python docs/models/desert/build_all.py
import bpy, os
ROOT_ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
bpy.ops.wm.read_factory_settings(use_empty=True)
exec(open(os.path.join(ROOT_, 'docs/models/kit.py')).read())
ROOT = ROOT_
for t in ('scout', 'gunner', 'wasp', 'kamikaze', 'sniper', 'swarm', 'shell', 'spider', 'repairer', 'turret', 'foreman'):
    exec(open(os.path.join(ROOT, 'docs/models/desert', t + '.py')).read())
    export('D' + t.capitalize(), 'packages/screen/public/models/desert/' + t + '.glb')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'docs/models/desert/desert.blend'))
