import json
import os
import urllib.request

# Latest season to fetch, inclusive. The WSDOT "Year" parameter is the season's
# starting year (e.g. 2025 == the 2025-26 winter).
LATEST_SEASON = 2025

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_PATH = os.path.join(BASE_DIR, 'pass_snowfall_data_raw.json')
PRETTY_PATH = os.path.join(BASE_DIR, 'pass_snowfall_data.json')

passId = {
    'Blewett_Pass_US-97': '1',
    'Sherman_Pass_SR-20': '9',
    'Stevens_Pass_US-2': '10',
    'Snoqualmie_Pass_I-90': '11',
    'White_Pass_US-12': '12'
}

passYear = {
    'Blewett_Pass_US-97': 2005,
    'Sherman_Pass_SR-20': 2005,
    'Stevens_Pass_US-2': 2004,
    'Snoqualmie_Pass_I-90': 1999,
    'White_Pass_US-12': 2005
}


def fetch_season(pass_id, year):
    url = (
        'https://wsdot.com/Travel/Real-time/Service/api/MountainPass/'
        f'SnowFallData?MountainPassId={pass_id}&Year={year}'
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode('utf-8'))


def download_data():
    data = {}
    for passName, pass_id in passId.items():
        print(passName)
        data[passName] = {}
        for year in range(passYear[passName], LATEST_SEASON + 1):
            try:
                data[passName][year] = fetch_season(pass_id, year)
            except Exception as err:  # noqa: BLE001 - keep going on a bad year
                print(f'  failed {passName} {year}: {err}')
    with open(RAW_PATH, 'w') as json_file:
        json.dump(data, json_file)


if __name__ == '__main__':
    download_data()

    # Re-emit the raw WSDOT response pretty-printed. The heavy per-day
    # transformation is done at render time in SnowPage.jsx, so this step is
    # intentionally just a formatting pass.
    with open(RAW_PATH, 'r') as json_file:
        data = json.load(json_file)

    with open(PRETTY_PATH, 'w') as json_file:
        json.dump(data, json_file, indent=4)