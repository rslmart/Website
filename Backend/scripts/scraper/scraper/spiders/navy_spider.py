from bs4 import BeautifulSoup
import csv
import re
import requests
import scrapy

# scrapy crawl navy_spider -o file.csv -t csv

class NavySpider(scrapy.Spider):
    name = "navy_spider"

    def start_requests(self):
        baseURL = 'https://www.nrlmry.navy.mil/tcdat/'
        page = requests.get(baseURL)
        soup = BeautifulSoup(page.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        seasonUrls = []
        #for a in allAs:
            # Season
            #if re.match(r'\w\w\d\d/', a.text):
                #seasonUrls.append(baseURL + a.text)
        seasonUrls = [baseURL + "tc11/"]
        for seasonUrl in seasonUrls:
            yield scrapy.Request(url=seasonUrl, callback=self.parseSeason)

    def parseSeason(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        basinUrls = []
        for a in allAs:
            # Basin
            if re.match(r'[A-Z\s]+/', a.text):
                basinUrls.append(response.url + a.text)
        for basinUrl in basinUrls:
            yield scrapy.Request(url=basinUrl, callback=self.parseBasin)

    def parseBasin(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        stormUrls = []
        for a in allAs:
            # Storm
            if re.match(r'\d\d', a.text):
                stormUrls.append(response.url + a.text)
        for stormUrl in stormUrls:
            yield scrapy.Request(url=stormUrl, callback=self.parseStorm)

    def parseStorm(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        typeUrls = []
        for a in allAs:
            # Type
            if re.match(r'[a-z\s]+/', a.text):
                typeUrls.append(response.url + a.text)
        for typeUrl in typeUrls:
            yield scrapy.Request(url=typeUrl, callback=self.parseType)

    def parseType(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        satelliteUrls = []
        for a in allAs:
            # Satellite
            if re.match(r'\w+/', a.text):
                satelliteUrls.append(response.url + a.text)
        for satelliteUrl in satelliteUrls:
            yield scrapy.Request(url=satelliteUrl, callback=self.parseSatellite)

    def parseSatellite(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        resolutionUrls = []
        imageUrls = []
        for a in allAs:
            # Resolution
            if re.match(r'\w+/', a.text):
                resolutionUrls.append(response.url + a.text)
            # Image
            elif re.match(r'\S+\.\S+\.(?:jpg|gif|png)$', a.text):
                imageUrls.append(response.url + a.text)
        for imageUrl in imageUrls:
            yield self.parseImageUrl(imageUrl)
        for resolutionUrl in resolutionUrls:
            yield scrapy.Request(url=resolutionUrl, callback=self.parseResolution)

    def parseResolution(self, response):
        soup = BeautifulSoup(response.text, 'html.parser')
        allAs = soup.find_all('a', href=True)
        imageUrls = []
        for a in allAs:
            # Image
            if re.match(r'\S+\.\S+\.(?:jpg|gif|png)$', a.text):
                imageUrls.append(response.url + a.text)
        for imageUrl in imageUrls:
            yield self.parseImageUrl(imageUrl)

    def parseImageUrl(self, imageUrl):
        fields = imageUrl.split('/')[4:]
        imageDict = {
            "season": fields[0],
            "basin": fields[1],
            "storm": fields[2],
            "type": fields[3],
            "satellite": fields[4]
        }
        if len(fields) ==6:
            imageDict["resolution"] = "none"
            imageDict["image"] = fields[5]
        if len(fields) == 7:
            imageDict["resolution"] = fields[5]
            imageDict["image"] = fields[6]
        return imageDict
