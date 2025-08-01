import os
import re

# --- 1. SET YOUR VARIABLES HERE ---
# The folder containing your files
folder_path = r"D:\Coding\Hackathon\Glacial_Lake_Detection_BAH-2025\data\LISS3\segments\input_stack\LISS3_1\chunks"

# The exact prefix you want to remove
prefix_to_remove = "LISS3_1_"

# Set to True to run a simulation.
# Set to False to perform the actual renaming.
dry_run = True
# ------------------------------------


# --- 2. SCRIPT LOGIC ---
if dry_run:
    print("--- DRY RUN MODE ---")
    print("No files will be changed.\n")
else:
    print("--- LIVE RUN MODE ---")
    print("Files will be permanently renamed.\n")

try:
    all_items = os.listdir(folder_path)

    # Optional: Sort files numerically for consistent processing order
    def get_numerical_key(filename):
        numbers = re.findall(r'\d+', filename)
        return [int(num) for num in numbers] if numbers else [-1]
    
    sorted_items = sorted(all_items, key=get_numerical_key)

    print(f"Scanning folder: {folder_path}\n")

    for filename in sorted_items:
        old_path = os.path.join(folder_path, filename)

        # Check if it is a file AND if it starts with the specified prefix
        if os.path.isfile(old_path) and filename.startswith(prefix_to_remove):
            
            # Create the new filename by removing the prefix
            new_filename = filename.removeprefix(prefix_to_remove)
            new_path = os.path.join(folder_path, new_filename)

            if dry_run:
                print(f"WOULD RENAME:  '{filename}'  ->  '{new_filename}'")
            else:
                os.rename(old_path, new_path)
                print(f"RENAMED:  '{filename}'  ->  '{new_filename}'")

    print("\n✅ Script finished.")

except FileNotFoundError:
    print(f"❌ ERROR: The folder path was not found.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")