import requests
import json

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

months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Apr', 'May']

def download_data():
    data = {}
    for passName in passId.keys():
        print(passName)
        data[passName] = {}
        for year in range(passYear[passName], 2025):
            response = requests.get(f'https://wsdot.com/Travel/Real-time/Service/api/MountainPass/SnowFallData?MountainPassId={passId[passName]}&Year={year}')
            data[passName][year] = response.json()
    with open(f'./pass_snowfall_data_raw.json', 'w') as json_file:
        json.dump(data, json_file)

if __name__ == '__main__':
    data = {}
    with open('./pass_snowfall_data_raw.json', 'r') as json_file:
        data = json.load(json_file)

    new_data = {}
    for passName in data.keys():
        new_data[passName] = {}


    with open('./pass_snowfall_data.json', 'w') as json_file:
        json.dump(data, json_file, indent=4)