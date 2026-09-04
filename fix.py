import re

with open('frontend/src/App.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'START' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*START', 'START', line.strip()) + '\n'
    if 'PAUSE' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*PAUSE', 'PAUSE', line.strip()) + '\n'
    if 'RESUME' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*RESUME', 'RESUME', line.strip()) + '\n'
    if 'STOP' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*STOP', 'STOP', line.strip()) + '\n'
    if 'ASSETS' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*ASSETS', 'ASSETS', line.strip()) + '\n'
    if 'AI FEED' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*AI FEED', 'INSIGHTS', line.strip()) + '\n'
    if 'CHAT' in line and '<' not in line:
        lines[i] = re.sub(r'^[^\w\<\>]*CHAT', 'COPILOT', line.strip()) + '\n'

with open('frontend/src/App.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
