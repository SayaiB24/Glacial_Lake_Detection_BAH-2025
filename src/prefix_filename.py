import os
import re # <-- Import the regular expressions module

# --- 1. SET YOUR VARIABLES HERE ---
folder_path = r"D:\Coding\Hackathon\Glacial_Lake_Detection_BAH-2025\data\LISS3\segments\layer_mask\LISS3_1\filtered_chunks"
prefix = "LISS3_1_"
dry_run = False
# ------------------------------------


# --- 2. SCRIPT LOGIC ---
if dry_run:
    print("--- DRY RUN MODE ---")
    print("No files will actually be changed.\n")
else:
    print("--- LIVE RUN MODE ---")
    print("Files will be permanently renamed.\n")

try:
    all_items = os.listdir(folder_path)
    
    # --- NEW SORTING LOGIC ---
    # A helper function that finds numbers in a filename for sorting
    def get_numerical_key(filename):
        numbers = re.findall(r'\d+', filename)
        # Convert found numbers to integers for a proper numerical sort
        return [int(num) for num in numbers] if numbers else [-1]

    # Sort the file list using the numerical key
    sorted_items = sorted(all_items, key=get_numerical_key)
    # --- END OF NEW LOGIC ---

    print(f"Scanning folder: {folder_path}\n")

    # Loop through the CORRECTLY SORTED list
    for filename in sorted_items:
        # Make sure not to rename the script itself!
        if filename == os.path.basename(__file__):
            continue
            
        old_path = os.path.join(folder_path, filename)

        if os.path.isfile(old_path):
            new_filename = prefix + filename
            
            if dry_run:
                print(f"WOULD RENAME:  '{filename}'  ->  '{new_filename}'")
            else:
                new_path = os.path.join(folder_path, new_filename)
                os.rename(old_path, new_path)
                print(f"RENAMED:  '{filename}'  ->  '{new_filename}'")

    print("\n✅ Script finished.")

except FileNotFoundError:
    print(f"❌ ERROR: The folder path was not found. Please check your `folder_path` variable.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")