"""Wikidata Action API access (wbgetentities) and the person-record parser.

The parser is GetData's, moved verbatim so records stay byte-compatible with
the legacy caches (rank/precision handling changes in -wdqs-fetch, not here).
"""
import json
import re

from royaltree import http

API = "https://www.wikidata.org/w/api.php"
BATCH = 50  # wbgetentities limit for non-bot clients
QID_RE = re.compile(r"Q\d+")


def iter_entity_batches(ids, props=None):
  """Yield ({qid: entity}, batch_ids) per 50-ID wbgetentities call.

  Items the API does not return (deleted/missing) are absent from the dict.
  Callers commit each batch, so a killed run keeps everything already fetched.
  """
  ids = list(ids)
  for i in range(0, len(ids), BATCH):
    batch = ids[i:i + BATCH]
    params = {"action": "wbgetentities", "ids": "|".join(batch), "languages": "en",
              "format": "json", "maxlag": http.MAXLAG}
    if props:
      params["props"] = props
    data = http.get_json(API, params=params)
    if "error" in data:
      raise http.FetchError(f"wbgetentities error {data['error'].get('code')}: {batch[:3]}...")
    entities = data.get("entities", {})
    found = {q: entities[q] for q in batch if q in entities and "missing" not in entities[q]}
    yield found, batch


def get_entities(ids, props=None):
  """{qid: entity} for every id (used by the list scraper)."""
  out = {}
  for found, _ in iter_entity_batches(ids, props):
    out.update(found)
  return out


def revision_info(ids):
  """{qid: lastrevid} via props=info (no claims; cheap revision check)."""
  out = {}
  for found, _ in iter_entity_batches(ids, props="info"):
    for q, ent in found.items():
      out[q] = ent.get("lastrevid")
  return out


def entity_label(item_data):
  return (item_data or {}).get("labels", {}).get("en", {}).get("value")


def parse_person(item_data):
  """Wikidata entity JSON -> the pipeline's person record (empty dict if None)."""
  person = {}
  if item_data:
    person["id"] = item_data["id"]
    person["label"] = item_data["labels"].get("en", {}).get("value")
    person["description"] = item_data["descriptions"].get("en", {}).get("value")
    # Access claims (statements)
    claims = item_data.get("claims", {})
    for property_id, claim_list in claims.items():
      if property_id in PROPERTIES:
        try:
          p = PROPERTIES[property_id]
          match property_id:
            # List-valued ID claims: educated at (P69), occupation (P106),
            # country of citizenship (P27), child (P40), spouse (P26),
            # unmarried partner (P451), languages (P1412), sibling (P3373),
            # religion or worldview (P140).
            case "P69" | "P106" | "P27" | "P40" | "P26" | "P451" | "P1412" | "P3373" | "P140":
              person[p] = [claim["mainsnak"]["datavalue"]["value"]["id"] for claim in
                           claim_list]
            # Single-valued ID claims: father (P22), mother (P25),
            # place of birth (P19), place of death (P20), place of burial (P119),
            # family (P53), cause of death (P509), sex or gender (P21).
            case "P22" | "P25" | "P19" | "P20" | "P119" | "P53" | "P509" | "P21":
              person[p] = claim_list[0]["mainsnak"]["datavalue"]["value"]["id"]
            case "P18" | "P109" | "P1442":  # image, signature, image of grave
              person[p] = [claim["mainsnak"]["datavalue"]["value"] for claim in claim_list]
            case "P569" | "P570":
              person[p] = claim_list[0]["mainsnak"]["datavalue"]["value"]["time"]
            case "P39" | "P97":
              person[p] = []
              for claim in claim_list:
                if "qualifiers" in claim and 'P582' in claim["qualifiers"]:
                  # Empress Matilda thanks
                  id = claim["mainsnak"]["datavalue"]["value"]["id"]
                  if id in {"Q116"}: # "monarch"
                    if "P1001" in claim["qualifiers"]:
                      id = claim["qualifiers"]["P1001"][0]["datavalue"]["value"]["id"]
                    elif "P642" in claim["qualifiers"]:
                      id = claim["qualifiers"]["P642"][0]["datavalue"]["value"]["id"]
                  position = {"id": id}
                  for qualifier_prop_id in claim["qualifiers"].keys():
                    qualifier = PROPERTIES.get(qualifier_prop_id, "")
                    if qualifier_prop_id in {"P580", "P582"}:
                      position[qualifier] = claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["time"]
                    elif qualifier_prop_id in {"P1534", "P642"} and claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                      position[qualifier] = claim["qualifiers"][qualifier_prop_id][0]["datavalue"]["value"]["id"]
                    elif qualifier_prop_id in {"P155", "P1365", "P1366","P156"} and claim["qualifiers"][qualifier_prop_id][0]['snaktype'] == 'value':
                      position[qualifier] = [q["datavalue"]["value"]["id"] for q in claim["qualifiers"][qualifier_prop_id]]
                  person[p].append(position)
              # sort this by end time
              person[p] = sorted(person[p], key=lambda x: x["end time"])
        except Exception as e:
          print(f"{e} {claim_list[0]}")

  return person


def qids_in(record):
  return set(QID_RE.findall(json.dumps(record)))


def label_record(data, labels):
  """Replace Q-IDs by labels except in the person-reference fields.

  GetData.PropertyRetriever.replace_ids_and_add_labels, unchanged in behaviour:
  ``labels`` is any mapping; an unknown Q-ID stays as the Q-ID. Note that
  'unmarried partner' is labelled too (known bug, fixed in -wdqs-fetch).
  """
  if isinstance(data, dict):
    new_dict = {}
    for key, value in data.items():
      if (key == "position held" or key == "noble title") and isinstance(value, list):
        updated = []
        for pos in value:
          if isinstance(pos, dict) and "id" in pos:
            pos = dict(pos)
            pos["label"] = labels.get(pos["id"], pos["id"])
          updated.append(pos)
        new_dict[key] = [label_record(item, labels) for item in updated]
      elif key in {"id", "mother", "father", "spouse", "child", "sibling", "relative", "from", "to"}:
        new_dict[key] = value
      else:
        new_dict[key] = label_record(value, labels)
    return new_dict
  if isinstance(data, list):
    return [label_record(item, labels) for item in data]
  if isinstance(data, str) and data.startswith("Q") and data[1:].isdigit():
    return labels.get(data, data)
  return data


PROPERTIES = {
  "P69": "educated at",
  "P106": "occupation",
  "P22": "father",
  "P25": "mother",
  "P26": "spouse",
  "P40": "child",
  "P18": "image",
  "P19": "place of birth",
  "P20": "place of death",
  "P119": "place of burial",
  "P27": "country of citizenship",
  "P39": "position held",
  "P451": "unmarried partner",
  "P569": "date of birth",
  "P570": "date of death",
  "P53": "family",
  "P109": "signature",
  "P509": "cause of death",
  "P463": "member of", #
  "P1038": "relative", #
  "P1412": "languages spoken, written or signed",
  "P3373": "sibling",
  "P140": "religion or worldview",
  "P2048": "height",
  "P1442": "image of grave",
  "P94": "coat of arms image",
  "P734": "family name",
  "P21": "sex or gender",
  "P97": "noble title",
  "P2348": "time period",
  "P580": "start time",
  "P582": "end time",
  # "from"/"to" intentionally unify two different Wikidata predecessor/successor
  # relations so anything walking the succession chain can follow it
  # regardless of which one a given entity uses:
  #   from <- replaces (P1365) and follows (P155)
  #   to   <- replaced by (P1366) and followed by (P156)
  # Do not split these apart without updating the code that reads them.
  "P1365": "from",
  "P1366": "to",
  "P1534": "end cause",
  "P642": "of",
  "P155": "from",
  "P156": "to",
  "P1001": "of",
}
