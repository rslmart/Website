import csv
import pymongo
import datetime
import re
import os
import pickle

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
ibtracsDB = mydb["ibtracs"]
imagesDB = mydb["images"]

# Check first option, then check the rest if first didn't match (not exact mapping)
images2ibtracsbasins = {
    'EPAC': ['EP', 'WP', 'SP'],
    'ATL': ['NA', 'SA'],
    'IO': ['NI', 'SI'],
    'SHEM': ['SI', 'SP', 'SA'],
    'WPAC': ['WP', 'EP', 'SP'],
    'CPAC': ['WP', 'EP', 'SP']
}

def isInt(s):
    try:
        int(s)
        return True
    except ValueError:
        return False

def parseRow(row):
    keys = ['season', 'basin', 'storm_name']
    rowDict = {}
    rowDict['season'] = int(row[1])
    rowDict['basin'] = row[3]
    rowDict['storm_name'] = row[4].split('.')[1]
    return rowDict

#just match storms with sids
def searchIbtracs(rowDict):
    searchSuccess = False
    basinIndex = 0
    name = rowDict['storm_name']
    while not searchSuccess:
        query = {"$and": [
            {
                'season': rowDict['season']
            }, {
                'basin': images2ibtracsbasins[rowDict['basin']][basinIndex]
            }, {
                'name': name
            }
        ]}
        doc = ibtracsDB.find_one(query)
        if doc is not None:
            searchSuccess = True
        else:
            print("Couldn't find ", rowDict, " with ", query)
            basinIndex += 1
            if basinIndex == len(images2ibtracsbasins[rowDict['basin']]):
                break
    if searchSuccess:
        print(rowDict, doc['sid'])
        return doc['sid']
    return ""

total = 0
mapping = {}
with open(os.path.join('..','Data','navy','options.csv'), 'r') as tcdatCSV:
    reader = csv.reader(tcdatCSV)
    header = next(reader)
    for row in reader:
        total += 1
        parsed = parseRow(row)
        if parsed['storm_name'] != 'NONAME':
            if parsed['season'] in mapping:
                if parsed['basin'] in mapping[parsed['season']]:
                    if parsed['storm_name'] not in mapping[parsed['season']][parsed['basin']]:
                        mapping[parsed['season']][parsed['basin']][parsed['storm_name']] = searchIbtracs(parsed)
                else:
                    mapping[parsed['season']][parsed['basin']] = {}
                    mapping[parsed['season']][parsed['basin']][parsed['storm_name']] = searchIbtracs(parsed)
            else:
                mapping[parsed['season']] = {}
                mapping[parsed['season']][parsed['basin']] = {}
                mapping[parsed['season']][parsed['basin']][parsed['storm_name']] = searchIbtracs(parsed)
        if total % 1000 == 0:
            print((total/157629) * 100, '% Done')
            print(mapping)
    with open('stormMapping.p', 'wb') as file:
        pickle.dump(mapping, file)
