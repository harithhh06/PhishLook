#!/usr/bin/env python3
"""
Super simple CSV → JSON converter for PhishLook.

Assumptions:
- Input file: phishing_database.csv
- Output file: phishing_database.json
- CSV headers are exactly:
  phish_id,url,phish_detail_url,submission_time,verified,verification_time,online,target
- No CLI flags, minimal logic.
"""

import csv
import json

INPUT_CSV = "phishing_database.csv"
OUTPUT_JSON = "phishing_database.json"

EXPECTED_FIELDS = [
	"phish_id",
	"url",
	"phish_detail_url",
	"submission_time",
	"verified",
	"verification_time",
	"online",
	"target",
]


def main():
	records = []
	# Use utf-8-sig to be tolerant of BOM
	with open(INPUT_CSV, "r", encoding="utf-8-sig", newline="") as f:
		reader = csv.DictReader(f)
		for row in reader:
			# Only keep the expected fields, defaulting to empty string if missing
			rec = {field: (row.get(field, "")) for field in EXPECTED_FIELDS}
			records.append(rec)

	with open(OUTPUT_JSON, "w", encoding="utf-8") as out:
		json.dump(records, out, ensure_ascii=False, indent=2)
		out.write("\n")

	print(f"Wrote {len(records)} record(s) to {OUTPUT_JSON}")


if __name__ == "__main__":
	main()

