from bs4 import BeautifulSoup
import re
import requests
import urllib.request
from multiprocessing import Pool
try:
    import cPickle as pickle
except ImportError:
    import pickle

class OptionObject:
    def __init__(self, name, key):
        self.name = name
        self.key = key
        self.previousOptions = []
        self.nextOptions = []

    def toString(self):
        return f"Name: {self.name}\n" \
               f"Key: {self.key}\n" \
               f"Previous: {[str(prevOption.name) for prevOption in self.previousOptions]}\n" \
               f"Next: {[str(nextOption.name) for nextOption in self.nextOptions]}"

keys = ['season', 'basin', 'storm_name', 'type', 'sensor', 'resolution', 'image']
regexOptions = {
    keys[0]: r'tc\d\d', #season
    keys[1]: r'[A-Z\s]+/', #basin
    keys[2]: r'\d\d', #storm
    keys[3]: r'[a-z\s]+/', #type
    keys[4]: r'\w+/', #sensor
    keys[5]: r'\w+/', #resolution
    keys[6]: r'\S+\.\S+\.(?:jpg|gif|png)$' #image
}

def parse(url, prevOption, keyIndex):
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    allAs = soup.find_all('a', href=True)
    urls = []
    for a in allAs:
        if re.match(regexOptions[keys[keyIndex]], a.text):
            urls.append(response.url + a.text)
    if len(urls) == 0: # Covers if resolution doesn't appear
        keyIndex += 1
        for a in allAs:
            if re.match(regexOptions[keys[keyIndex]], a.text):
                urls.append(response.url + a.text)
    if keyIndex == 6: # At images, ie the end:
        option = OptionObject('images', keys[keyIndex])
        option.previousOptions.append(prevOption)
        prevOption.nextOptions.append(option)
        return
    else:
        for url in urls:
            #print(url)
            option = OptionObject(url.split('/')[-2], keys[keyIndex])
            if keyIndex == 2:  # storm name is a special case
                storm = url.split('/')[-2].split('.')
                stormNumber = storm[0][:2]
                stormAgency = ''
                if len(storm[1]) > 0:
                    stormAgency = storm[0][2:]
                stormName = storm[1]
                option = OptionObject(stormName, keys[keyIndex])
            option.previousOptions.append(prevOption)
            prevOption.nextOptions.append(option)
            print(prevOption.toString())
            parse(url, option, keyIndex + 1)

def start(vars):
    url = vars[0]
    startOption = vars[1]
    keyIndex = 0
    print(url)
    option = OptionObject(url.split('/')[-2], keys[keyIndex])
    option.previousOptions.append(startOption)
    startOption.nextOptions.append(option)
    parse(url, option, keyIndex + 1)

if __name__ == '__main__':
    startOption = OptionObject("start", "start")
    keyIndex = 0
    response = requests.get('https://www.nrlmry.navy.mil/tcdat/')
    soup = BeautifulSoup(response.text, 'html.parser')
    allAs = soup.find_all('a', href=True)
    urls = []
    for a in allAs:
        if re.match(regexOptions[keys[keyIndex]], a.text):
            urls.append(response.url + a.text)
    with Pool(8) as p:
        p.map(start, [(u, startOption) for u in urls])

    pickle.dump(startOption, open("options.p", "wb"))