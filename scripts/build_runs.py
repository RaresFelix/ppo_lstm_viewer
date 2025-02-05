#!/usr/bin/env python3
import os
import json
import re

# Task types to process
TASK_TYPES = ['maze', 'memory']
BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'runs')

# Create base directory if it doesn't exist
os.makedirs(BASE_DIR, exist_ok=True)

pattern = re.compile(r'env_\d{4}\.png')

for task in TASK_TYPES:
    task_dir = os.path.join(BASE_DIR, task)
    # Create task directory if it doesn't exist
    os.makedirs(task_dir, exist_ok=True)
    
    runs = []
    # Check if there are any run directories
    try:
        run_dirs = os.listdir(task_dir)
    except OSError:
        run_dirs = []
    
    for run_id in run_dirs:
        run_dir = os.path.join(task_dir, run_id)
        if not os.path.isdir(run_dir):
            continue
        images_dir = os.path.join(run_dir, 'images')
        if not os.path.isdir(images_dir):
            continue
        
        try:
            frames = sum(1 for file in os.listdir(images_dir) if pattern.match(file))
            if frames > 0:
                runs.append({
                    "id": run_id,
                    "frame_count": frames
                })
        except OSError as e:
            print(f"Error processing {images_dir}: {e}")
            continue

    # Even if no runs found, create an empty runs.json
    output_file = os.path.join(task_dir, 'runs.json')
    with open(output_file, 'w') as f:
        json.dump(runs, f, indent=2)
    print(f'Generated {output_file} with {len(runs)} runs.')
