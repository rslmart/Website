from bs4 import BeautifulSoup
import os
import re
import requests
import scrapy

# scrapy crawl navy_spider -o file.csv -t csv

# many storms don't have this outside ATL, so not really useful :(
class NavySpider(scrapy.Spider):
    name = "navy_trackfile_spider"

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

    def parseTrackfileUrl(self, response):
        fields = response.request.url.split('/')[4:]
        trackfileDict = {
            "season": fields[0],
            "basin": fields[1],
            "storm": fields[2],
            "trackCSV": response.text
        }
        with open(os.path.join('trackfiles', '.'.join(fields[:3])+'.csv'), 'w') as csvfile:
            csvfile.write(response.text)

        return trackfileDict
