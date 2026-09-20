"""Run the same Python template exported by Nerd Lab, with a wave/vortex example."""
import json
from pathlib import Path
template=Path(__file__).resolve().parents[1]/'Assets/FleetCommander/Resources/SciencePython.txt'
config={'layers':[{'kind':4,'frequency':.6,'phase':0,'strength':10,'blend':1},{'kind':1,'frequency':.6,'phase':0,'strength':7,'blend':1}], 'time':5, 'amplitude':15, 'frequency':1, 'sigma':10, 'rho':28, 'beta':8/3}
source=template.read_text().replace('__CONFIG_JSON__',json.dumps(config))
exec(compile(source,str(template),'exec'),{'__name__':'__main__'})
