import csv
import requests
import re
from bs4 import BeautifulSoup

baseURL = 'https://www.nrlmry.navy.mil/tcdat/'

def main():
    page = requests.get(baseURL)
    soup = BeautifulSoup(page.text, 'html.parser')
    allAs = soup.find_all('a', href=True)
    urlArray = [baseURL]
    for a in allAs:
        imageUrls = []
        # Season
        if re.match(r'\w\w\d\d/', a.text):
            urlArray.append(a.text)
            print(a.text)
            page = requests.get(''.join(urlArray))
            soup = BeautifulSoup(page.text, 'html.parser')
            allAs = soup.find_all('a', href=True)
            for a in allAs:
                # Basin
                if re.match(r'[A-Z\s]+/', a.text):
                    urlArray.append(a.text)
                    print(a.text)
                    page = requests.get(''.join(urlArray))
                    soup = BeautifulSoup(page.text, 'html.parser')
                    allAs = soup.find_all('a', href=True)
                    for a in allAs:
                        # Storm
                        if re.match(r'\d\d', a.text):
                            urlArray.append(a.text)
                            print(a.text)
                            page = requests.get(''.join(urlArray))
                            soup = BeautifulSoup(page.text, 'html.parser')
                            allAs = soup.find_all('a', href=True)
                            for a in allAs:
                                # type
                                if re.match(r'[a-z\s]+/', a.text):
                                    urlArray.append(a.text)
                                    print(a.text)
                                    page = requests.get(''.join(urlArray))
                                    soup = BeautifulSoup(page.text, 'html.parser')
                                    allAs = soup.find_all('a', href=True)
                                    for a in allAs:
                                        # satellite
                                        if re.match(r'\w+/', a.text):
                                            urlArray.append(a.text)
                                            print(a.text)
                                            page = requests.get(''.join(urlArray))
                                            soup = BeautifulSoup(page.text, 'html.parser')
                                            allAs = soup.find_all('a', href=True)
                                            for a in allAs:
                                                # resolution
                                                if re.match(r'\w+/', a.text):
                                                    urlArray.append(a.text)
                                                    print(a.text)
                                                    page = requests.get(''.join(urlArray))
                                                    soup = BeautifulSoup(page.text, 'html.parser')
                                                    allAs = soup.find_all('a', href=True)
                                                    for a in allAs:
                                                        # images
                                                        if re.match(r'\S+\.\S+\.(?:jpg|gif|png)$', a.text):
                                                            urlArray.append(a.text)
                                                            print(urlArray[2:])
                                                            imageUrls.append(urlArray[2:])
                                                            urlArray.pop(-1);
                                                    urlArray.pop(-1);
                                                # or images
                                                elif re.match(r'\S+\.\S+\.(?:jpg|gif|png)$', a.text):
                                                    urlArray.append(a.text)
                                                    print(urlArray[2:])
                                                    imageUrls.append(urlArray[2:])
                                                    urlArray.pop(-1);
                                            urlArray.pop(-1);
                                        print(len(imageUrls))
                                    urlArray.pop(-1);
                                print(len(imageUrls))
                            urlArray.pop(-1);
                        print(len(imageUrls))
                    urlArray.pop(-1);
                print(len(imageUrls))
            urlArray.pop(-1);
            print(len(imageUrls))
            with open(a.text[:-1] + '.csv', mode='w') as file:
                writer = csv.writer(file, delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
                for image in imageUrls:
                    writer.writerow(image)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print()