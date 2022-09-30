from bs4 import BeautifulSoup
import re
import scrapy
import datetime
import pickle

# scrapy crawl navy_image_spider_v2 -o tcdat.csv -t csv

keys = ['season', 'basin', 'storm_name', 'type', 'sensor', 'resolution', 'image']
regexOptions = {
    keys[0]: r'tc\d\d', #season
    keys[1]: r'(ATL|CPAC|EPAC)/', #basin
    keys[2]: r'\d\d', #storm
    keys[3]: r'ir/', #type
    keys[4]: r'geo/', #sensor
    keys[5]: r'1km/', #resolution
    keys[6]: r'\S+\.\S+\.(?:jpg|gif|png)$' #image
}

class NavySpider(scrapy.Spider):
    name = "navy_image_spider_v2"

    def start_requests(self):
        baseURL = 'https://www.nrlmry.navy.mil/tcdat/'
        request = scrapy.Request(url=baseURL, callback=self.parse)
        request.meta['keyIndex'] = 0
        yield request

    def parse(self, response):
        keyIndex = response.meta['keyIndex']
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        urls = []
        for a in allAs:
            if re.match(regexOptions[keys[keyIndex]], a.text):
                urls.append(response.url + a.text)
        if len(urls) == 0 and keyIndex != 6: # Covers if resolution doesn't appear
            keyIndex += 1
            for a in allAs:
                if re.match(regexOptions[keys[keyIndex]], a.text):
                    urls.append(response.url + a.text)
        if keyIndex == 6: # At images, ie the end:
            for url in urls:
                yield self.parseImageUrl(url)
        else:
            for url in urls:
                request = scrapy.Request(url=url, callback=self.parse)
                request.meta['keyIndex'] = keyIndex + 1
                yield request

    def parseImageUrl(self, imageUrl):
        def isInt(s):
            try:
                int(s)
                return True
            except ValueError:
                return False
        imageUrlArr = imageUrl.split('/')[4:] # season starts at index 4, images with resolution are length 11
        rowDict = {'image_url': imageUrl}
        for i in range(len(imageUrlArr)-1): # Don't go all the way to end, save that for parsed image info
            rowDict[keys[i]] = imageUrlArr[i]
            if len(imageUrlArr) == 6: # image doesn't have resolution and ends here instead
                rowDict['resolution'] = ''
            if keys[i] == 'sensor' and 'latest' in imageUrlArr[i]:
                return
            if keys[i] == 'season':
                if imageUrlArr[i][2] == '9':
                    rowDict[keys[i]] = int('19' + imageUrlArr[i][2:])
                else:
                    rowDict[keys[i]] = int('20' + imageUrlArr[i][2:])
        image = imageUrlArr[-1].replace(',','.').split('.')
        if len(image[0]) >= 8:
            dateStart = 0
            while dateStart < len(image[0]):
                if isInt(image[0][dateStart:dateStart + 4]) and int(image[0][dateStart:dateStart + 4]) >= 1997 and int(
                        image[0][dateStart:dateStart + 4]) <= 2020:
                    break
                dateStart += 1
            if isInt(image[0][dateStart:dateStart + 4]) and int(image[0][dateStart:dateStart + 4]) >= 1997 and int(
                    image[0][dateStart:dateStart + 4]) <= 2020:
                rowDict['year'] = int(image[0][dateStart:dateStart + 4])
                if isInt(image[0][dateStart + 4:dateStart + 6]) and int(
                        image[0][dateStart + 4:dateStart + 6]) >= 1 and int(
                        image[0][dateStart + 4:dateStart + 6]) <= 12:
                    rowDict['month'] = int(image[0][dateStart + 4:dateStart + 6])
                    if isInt(image[0][dateStart + 6:dateStart + 8]) and int(
                            image[0][dateStart + 4:dateStart + 6]) >= 1 and int(
                            image[0][dateStart + 4:dateStart + 6]) <= 31:
                        rowDict['day'] = int(image[0][dateStart + 6:dateStart + 8])
                        date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'])
                        if len(image[1]) >= 4:
                            if isInt(image[1][:2]) and int(image[1][:2]) >= 0 and int(image[1][:2]) <= 23:
                                rowDict['hour'] = int(image[1][:2])
                                date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'],
                                                         rowDict['hour'])
                            if isInt(image[1][2:4]) and int(image[1][2:4]) >= 0 and int(image[1][2:4]) <= 60:
                                rowDict['minute'] = int(image[1][2:4])
                                date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'],
                                                         rowDict['hour'],
                                                         rowDict['minute'])
                                if len(image[1]) >= 6:
                                    if isInt(image[1][4:]) and int(image[1][4:]) >= 0 and int(image[1][4:]) <= 60:
                                        rowDict['second'] = int(image[1][4:])
                                        date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'],
                                                                 rowDict['hour'], rowDict['minute'], rowDict['second'])
                        rowDict['date'] = date
        if len(image[2]) > 0:
            rowDict['satellite'] = image[2]
            if re.fullmatch('[\d]{8}$', image[2]):
                rowDict['satellite'] = image[4]
        rowDict['extension'] = image[-1]
        return rowDict