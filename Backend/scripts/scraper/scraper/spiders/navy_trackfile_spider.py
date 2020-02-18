from bs4 import BeautifulSoup
import csv
import re
import requests
import scrapy

# scrapy crawl navy_spider -o file.csv -t csv

class NavySpider(scrapy.Spider):
    name = "navy__trackfile_spider"

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
        seasonUrls = [baseURL + "tc19/"]
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
        trackfileUrls = []
        for a in allAs:
            # trackfile
            if re.match(r'trackfile\.txt', a.text):
                trackfileUrls.append(response.url + a.text)
        for trackfileUrl in trackfileUrls:
            yield scrapy.Request(url=trackfileUrl, callback=self.parseTrackfileUrl)

    #actually scrape the trackfile info
    def parseTrackfileUrl(self, response):
        fields = trackfileUrl.split('/')[4:]
        trackfileDict = {
            "season": fields[0],
            "basin": fields[1],
            "storm": fields[2],
            "trackfile": fields[3]
        }
        if len(fields) ==6:
            trackfileDict["resolution"] = "none"
            trackfileDict["trackfile"] = fields[5]
        if len(fields) == 7:
            trackfileDict["resolution"] = fields[5]
            trackfileDict["trackfile"] = fields[6]
        return trackfileDict
