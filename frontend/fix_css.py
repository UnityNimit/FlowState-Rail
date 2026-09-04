import os
files = ["src/App.css", "src/components/ControlRoom.css", "src/components/Header.css", "src/pages/DashboardPage.css", "src/pages/HomePage.css"]
for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        content = content.replace("width: 100vw", "width: 100%")
        with open(f, 'w', encoding='utf-8', newline='') as file:
            file.write(content)
