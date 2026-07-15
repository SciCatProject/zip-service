import os
import sys
import h5py
import numpy as np

out = sys.argv[1]
size_mb = int(sys.argv[2])

# uint16
target_bytes = size_mb * 1024 * 1024
n_values = target_bytes // 2

rows = 1024
cols = max(1, n_values // rows)

os.makedirs(os.path.dirname(out), exist_ok=True)

with h5py.File(out, "w") as f:
    f.attrs["NX_class"] = "NXroot"

    entry = f.create_group("entry0")
    entry.attrs["NX_class"] = "NXentry"

    instrument = entry.create_group("instrument")
    instrument.attrs["NX_class"] = "NXinstrument"

    detector = instrument.create_group("detector")
    detector.attrs["NX_class"] = "NXdetector"

    data = detector.create_dataset(
        "data",
        shape=(rows, cols),
        dtype="uint16",
        chunks=(256, 256),
    )

    chunk_rows = 256
    for start in range(0, rows, chunk_rows):
        end = min(start + chunk_rows, rows)
        data[start:end, :] = np.random.randint(
            0,
            65535,
            size=(end - start, cols),
            dtype=np.uint16,
        )

    entry["data"] = h5py.SoftLink("/entry0/data")

print(f"Created {out}: {os.path.getsize(out) / 1024 / 1024:.1f} MB")
