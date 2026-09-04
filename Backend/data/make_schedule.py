import csv

trains = [
    ("12004", "LUCKNOW SHATABDI", "SIG-ENTRY-DNM", "SIG-EXIT-DNM", "00:01:00", "Shatabdi"),
    ("22436", "VANDE BHARAT EXP", "SIG-ENTRY-DNM", "SIG-EXIT-DNM", "00:03:00", "Shatabdi"),
    ("12424", "DIBRUGARH RAJDHANI", "SIG-EXIT-UPM", "SIG-ENTRY-UPM", "00:02:00", "Rajdhani"),
    ("12301", "HOWRAH RAJDHANI", "SIG-EXIT-UPM", "SIG-ENTRY-UPM", "00:05:00", "Rajdhani"),
    ("12560", "SHIV GANGA SF EXP", "SIG-ENTRY-DNM", "SIG-EXIT-DNM", "00:06:00", "SF Express"),
    ("12392", "SHRAMJEEVI EXP", "SIG-EXIT-UPM", "SIG-ENTRY-UPM", "00:08:00", "Express"),
    ("64402", "GZB-DLI EMU LOCAL", "SIG-EXIT-UPS", "SIG-ENTRY-UPS", "00:02:30", "MEMU"),
    ("64411", "DLI-GZB EMU LOCAL", "SIG-ENTRY-DNS", "SIG-EXIT-DNS", "00:04:30", "MEMU"),
    ("BOXN-401", "COAL FREIGHT SPECIAL", "SIG-EXIT-UPS", "SIG-ENTRY-UPS", "00:09:00", "Express"),
    ("CON-802", "CONTAINER FREIGHT", "SIG-ENTRY-DNS", "SIG-EXIT-DNS", "00:11:00", "Express")
]

with open("Backend/data/corridor_schedule.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["Train No", "Train Name", "Start Node", "End Node", "Arrival time", "Type"])
    for t in trains:
        writer.writerow(t)

print("Created Backend/data/corridor_schedule.csv successfully!")
