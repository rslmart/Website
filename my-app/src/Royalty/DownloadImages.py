import requests
import json
from googleapiclient.discovery import build
from PIL import Image
import os

with open('../credentials.json', 'r') as file:
    credentials = json.load(file)

def download_image(url, file_path):
    base_name, original_extension = os.path.splitext(file_path)
    new_file_path = base_name + '.jpg'
    if not os.path.exists(new_file_path):
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'})
        if response.status_code == 200:
            with open(file_path, 'wb') as file:
                file.write(response.content)

            if file_path.split('.')[-1] != 'jpg':
                # Open the image using PIL
                image = Image.open(file_path)
                image.convert('RGB')
                image.save(new_file_path)
            print("Downloaded successfully: {}".format(url))
        else:
            raise Exception("Failed to download {}. Status code: {}".format(url, response.status_code))
    else:
        print("Image already exists: ", new_file_path)

def search_images(api_key, cx, query):
    service = build("customsearch", "v1", developerKey=api_key)
    res = service.cse().list(q=query, cx=cx, searchType='image', fileType='jpg').execute()
    items = res['items'] if 'items' in res else []
    return [item['link'] for item in items]


if __name__ == '__main__':
    with open('royaltree_fixed.json', 'r') as file:
        data = json.load(file)

    for person in data.values():
        # urls = search_images(credentials['GOOGLE_TOKEN'], credentials['SEARCH_ENGINE_ID'], "{} actual portrait".format(person['name']))
        urls = []
        if 'picture' in person and person['picture']:
            urls.append(' http:' + person['picture'])
        for url in urls:
            try:
                download_image(urls[0], './Images/{}.{}'.format(person['id'], urls[0].split('.')[-1].split('?')[0]))
            except Exception as e:
                print("Invalid URL", url)
                print(e)