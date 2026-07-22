import requests
import time
from datetime import datetime
import json

# Wikimedia's API now rejects requests without a descriptive User-Agent
# (HTTP 403). See https://meta.wikimedia.org/wiki/User-Agent_policy.
WIKIMEDIA_HEADERS = {
    "User-Agent": "RoyaltyTreeBot/1.0 (personal genealogy chart project)"
}


def _get_json_with_retry(url, max_retries=6):
  """GET a Wikimedia API URL, retrying with exponential backoff on rate limits
  (HTTP 429) and transient network errors. Returns parsed JSON or None."""
  delay = 2
  for attempt in range(max_retries):
    try:
      response = requests.get(url, headers=WIKIMEDIA_HEADERS)
      if response.status_code == 429:
        wait = int(response.headers.get("Retry-After", delay))
        print(f"Rate limited (429); waiting {wait}s (attempt {attempt + 1}/{max_retries})")
        time.sleep(wait)
        delay = min(delay * 2, 60)
        continue
      response.raise_for_status()
      return response.json()
    except requests.exceptions.RequestException as e:
      print(f"Error fetching (attempt {attempt + 1}/{max_retries}): {e}")
      time.sleep(delay)
      delay = min(delay * 2, 60)
  print(f"Giving up after {max_retries} attempts: {url}")
  return None

def datetime_encoder(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()

    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

def saveData(data, file_name):
    print("Saving Data: {}".format(len(data)))
    # Convert dictionary to JSON string using the custom encoder
    json_data = json.dumps(data, default=datetime_encoder, indent=4)
    # Write JSON data to a file
    with open("{}.json".format(file_name), "w") as file:
        file.write(json_data)


def get_wikidata_data(item_id):
  url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={item_id}&languages=en&format=json"
  data = _get_json_with_retry(url)
  if data and "entities" in data and item_id in data["entities"]:
    return data["entities"][item_id]
  print(f"No data found for item ID: {item_id}")
  return None


def get_wikidata_data_for_list(item_ids):
  result = {}
  # Split the list into chunks of 50 items each
  for i in range(0, len(item_ids), 50):
    print(f"Progress Retrieving Items: {i/len(item_ids) * 100:.2f}% {i}/{len(item_ids)}")
    batch = item_ids[i:i + 50]
    batch_ids = "|".join(batch)
    url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={batch_ids}&languages=en&format=json"

    data = _get_json_with_retry(url)
    if not data or "entities" not in data:
      print(f"No data found for batch: {batch}")
      continue

    # Verify all items in this batch are present
    for item_id in batch:
      if item_id not in data["entities"]:
        print(f"No data found for item ID: {item_id}")
        continue
      result[item_id] = data["entities"][item_id]

  return result