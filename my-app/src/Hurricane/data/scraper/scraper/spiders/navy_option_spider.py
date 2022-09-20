from bs4 import BeautifulSoup
import re
import scrapy
import datetime
import pickle

# scrapy crawl navy_option_spider -o options.csv -t csv

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

class NavySpider(scrapy.Spider):
    name = "navy_option_spider"

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
            yield self.parseImageUrls(urls)
        else:
            for url in urls:
                request = scrapy.Request(url=url, callback=self.parse)
                request.meta['keyIndex'] = keyIndex + 1
                yield request

    def parseImageUrls(self, imageUrls):
        def isInt(s):
            try:
                int(s)
                return True
            except ValueError:
                return False
        if len(imageUrls) == 0:
            print('No image urls')
            return
        beginDate = datetime.datetime(2021, 1, 1)
        endDate = datetime.datetime(1996, 1, 1)
        satellites = set()
        extensions = set()
        rowDict = {'imageCount': len(imageUrls)}
        imageUrlArr = imageUrls[0].split('/')[4:]  # season starts at index 4, images with resolution are length 11
        for i in range(len(imageUrlArr) - 1):  # Don't go all the way to end, save that for parsed image info
            rowDict[keys[i]] = imageUrlArr[i]
            if len(imageUrlArr) == 6:  # image doesn't have resolution and ends here instead
                rowDict['resolution'] = ''
            if keys[i] == 'season':
                if imageUrlArr[i][2] == '9':
                    rowDict[keys[i]] = int('19' + imageUrlArr[i][2:])
                else:
                    rowDict[keys[i]] = int('20' + imageUrlArr[i][2:])
        for imageUrl in imageUrls:
            imageUrlArr = imageUrl.split('/')[4:] # season starts at index 4, images with resolution are length 11
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
                    year = int(image[0][dateStart:dateStart + 4])
                    if isInt(image[0][dateStart + 4:dateStart + 6]) and int(
                            image[0][dateStart + 4:dateStart + 6]) >= 1 and int(
                            image[0][dateStart + 4:dateStart + 6]) <= 12:
                        month = int(image[0][dateStart + 4:dateStart + 6])
                        if isInt(image[0][dateStart + 6:dateStart + 8]) and int(
                                image[0][dateStart + 4:dateStart + 6]) >= 1 and int(
                                image[0][dateStart + 4:dateStart + 6]) <= 31:
                            day = int(image[0][dateStart + 6:dateStart + 8])
                            date = datetime.datetime(year, month, day)
                            if len(image[1]) >= 4:
                                if isInt(image[1][:2]) and int(image[1][:2]) >= 0 and int(image[1][:2]) <= 23:
                                    hour = int(image[1][:2])
                                    date = datetime.datetime(year, month, day,
                                                             hour)
                                if isInt(image[1][2:4]) and int(image[1][2:4]) >= 0 and int(image[1][2:4]) <= 60:
                                    minute = int(image[1][2:4])
                                    date = datetime.datetime(year, month, day,
                                                             hour,
                                                             minute)
                                    if len(image[1]) >= 6:
                                        if isInt(image[1][4:]) and int(image[1][4:]) >= 0 and int(image[1][4:]) <= 60:
                                            second = int(image[1][4:])
                                            date = datetime.datetime(year, month, day,
                                                                     hour, minute, second)
                            if (date < beginDate):
                                beginDate = date
                            elif (date > endDate):
                                endDate = date
            satellite = ""
            if len(image[2]) > 0:
                satellite = image[2]
                if re.fullmatch('[\d]{8}$', image[2]):
                    satellite = image[4]
            if satellite != "":
                satellites.add(satellite)
            extensions.add(image[-1])
        if beginDate != datetime.datetime(2021, 1, 1):
            rowDict['beginDate'] = beginDate
        if endDate != datetime.datetime(1996, 1, 1):
            rowDict['endDate'] = endDate
        if len(satellites) != 0:
            rowDict['satellites'] = satellites
        if len(extensions) != 0:
            rowDict['extensions'] = extensions
        return rowDict