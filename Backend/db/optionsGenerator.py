import pymongo
from multiprocessing import Pool

class OptionObject:
    def __init__(self, name, key):
        self.name = name
        self.key = key
        self.previousOptions = []
        self.nextOptions = []

    def toString(self):
        return ','.join([str(self.name),
                         str(self.key),
                         str([str(prevOption.name) for prevOption in self.previousOptions]),
                         str([str(nextOption.name) for nextOption in self.nextOptions])
                         ])

keys = ['season', 'basin', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'extension']

query = {"$and": [{"season": 2001}]}

def getOptionObjects(prevQueryList, prevOption, keyIndex, valueList, imagesCol):
    for value in valueList:
        option = OptionObject(value, keys[keyIndex])
        option.previousOptions.append(prevOption)
        prevOption.nextOptions.append(option)
        print(prevOption.toString())
        if keyIndex < 7:
            queryList = prevQueryList + [{keys[keyIndex]: value}]
            query = {"$and": queryList}
            nextValues = imagesCol.find(query).distinct(keys[keyIndex + 1])
            if len(nextValues) == 0:
                nextValues = imagesCol.find(query).distinct(keys[keyIndex + 2])
                getOptionObjects(queryList, option, keyIndex + 2, nextValues, imagesCol)
            else:
                getOptionObjects(queryList, option, keyIndex + 1, nextValues, imagesCol)

# Don't have to write fancy recursion, can just go level by level
def start(season):
    myclient = pymongo.MongoClient("mongodb://localhost:27017/")
    mydb = myclient["mydatabase"]
    imagesCol = mydb["images"]
    option = OptionObject(season, keys[0])
    query = {"$and": [{"season": season}]}
    nextValues = imagesCol.find(query).distinct(keys[1])
    getOptionObjects([{"season": season}], option, 1, nextValues, imagesCol)

startOption = OptionObject("start", "start")
with Pool(4) as p:
    startOption.nextOptions = p.map(start, range(1997, 2020, 1))