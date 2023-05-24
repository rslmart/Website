import requests
import json
from googleapiclient.discovery import build

with open('../credentials.json', 'r') as file:
    credentials = json.load(file)

def download_image(url, file_path):
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'})
    if response.status_code == 200:
        with open(file_path, 'wb') as file:
            file.write(response.content)
        print("Downloaded successfully: {}".format(url))
    else:
        raise Exception("Failed to download {}. Status code: {}".format(url, response.status_code))

def search_images(api_key, cx, query):
    service = build("customsearch", "v1", developerKey=api_key)
    res = service.cse().list(q=query, cx=cx, searchType='image', fileType='jpg').execute()
    items = res['items'] if 'items' in res else []
    return [item['link'] for item in items]


with open('royaltree_fixed.json', 'r') as file:
    data = json.load(file)

for person in data.values():
    # urls = search_images(credentials['GOOGLE_TOKEN'], credentials['SEARCH_ENGINE_ID'], "{} actual portrait".format(person['name']))
    urls = []
    if 'picture' in person and person['picture']:
        urls.append(' http:' + person['picture'])
    for url in urls:
        try:
            download_image(urls[0], './Images/{}.{}'.format(person['id'], urls[0].split('.')[-1].split('?')))
            break
        except Exception as e:
            print("Invalid URL", url)
            print(e)