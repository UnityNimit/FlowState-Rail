import csv
import random
from datetime import datetime, timedelta

# --- CONFIGURATION ---
OUTPUT_FILE = './data/intelligent_schedule.csv'
START_TIME = datetime.strptime("00:00:00", "%H:%M:%S")
TRAIN_COUNT = 100 # Number of trains to generate

# Priority mapping based on your image (Highest to Lowest)
TRAIN_TYPES = [
    'Rajdhani', 'Shatabdi', 'SF Express', 'Express',
    'Mail', 'Passenger', 'MEMU', 'DMU'
]

def generate_schedule():
    """Generates a synthetic schedule designed to create conflicts."""
    header = [
        'Train No', 'Train Name', 'Start Node', 'End Node',
        'Arrival time', 'Type'
    ]
    
    trains = []
    for i in range(TRAIN_COUNT):
        train_no = random.randint(10000, 99999)
        train_type = random.choice(TRAIN_TYPES)
        
        # Cluster arrival times to create conflicts
        arrival_time = START_TIME + timedelta(minutes=random.randint(0, 10))  # Within first 5 hours
        
        # Randomly assign start and end points from the schematic
        start_node = random.choice(['S-APP-1', 'S-APP-2'])
        end_node = random.choice(['T-EAST', 'T-WEST'])

        trains.append([
            train_no,
            f'TRN-{train_no % 1000}-{train_type[:3].upper()}',
            start_node,
            end_node,
            arrival_time.strftime('%H:%M:%S'),
            train_type
        ])

    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(trains)

    print(f"✅ Successfully generated new schedule with {TRAIN_COUNT} trains at '{OUTPUT_FILE}'")

if __name__ == '__main__':
    generate_schedule()