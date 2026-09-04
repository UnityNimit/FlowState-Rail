import re, os
emoji_pattern = re.compile(r'[\U00010000-\U0010ffff\u2600-\u27FF\u2B50\u2B55\u23F8\u23F9\u23FA\u25B6\u23EF\u25C0\u2190-\u21FF]')
for root, _, files in os.walk('frontend/src'):
    for f in files:
        if f.endswith('.js'):
            with open(os.path.join(root, f), 'r', encoding='utf-8') as file:
                lines = file.readlines()
                for i, line in enumerate(lines):
                    if emoji_pattern.findall(line):
                        print(f"File: {f}, Line {i+1}, Matches: {emoji_pattern.findall(line)}")
