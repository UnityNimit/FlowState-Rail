import os
import json

def generate_arch(root_dir, title):
    arch = f"# {title} Architecture\n\n"
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip node_modules, venv, .git, etc.
        dirnames[:] = [d for d in dirnames if d not in ['.git', 'node_modules', 'venv', '__pycache__', 'build']]
        
        level = dirpath.replace(root_dir, '').count(os.sep)
        indent = '    ' * level
        basename = os.path.basename(dirpath)
        if basename:
            arch += f"{indent}- **{basename}/**\n"
        
        subindent = '    ' * (level + 1)
        for f in filenames:
            arch += f"{subindent}- {f}\n"
    return arch

backend_arch = generate_arch('Backend', 'Backend')
with open('Backend_Architecture.md', 'w', encoding='utf-8') as f:
    f.write(backend_arch)

frontend_arch = generate_arch('frontend', 'Frontend')
with open('Frontend_Architecture.md', 'w', encoding='utf-8') as f:
    f.write(frontend_arch)

full_arch = f"# Full Project Architecture\n\n## Backend\n{backend_arch}\n## Frontend\n{frontend_arch}"
with open('Project_Architecture.md', 'w', encoding='utf-8') as f:
    f.write(full_arch)

print("Architecture files generated.")
