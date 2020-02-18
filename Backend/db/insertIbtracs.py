import csv
import os
#import pymongo

#myclient = pymongo.MongoClient("mongodb://localhost:27017/")
#mydb = myclient["mydatabase"]
#mycol = mydb["imageUrls"]

def parseRow(header, row):
    rowDict = {}
    for i in range(len(header)):
        rowDict[header[i]] = row[i]
    print(rowDict)

with open(os.path.join('..','Data','ibtracs','ibtracs.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)

    batch_size = 100
    batch = []
    count = 0

    header = next(reader)
    units = next(reader)

    print(header)
    print(units)

    for row in reader:
        if count >= batch_size:
            # put in db
            batch = []
            count = 0
        batch.append(parseRow(header, row))
        count += 1
        break
    if batch:
        pass

# x = mycol.insert_many(mylist)

#print list of the _id values of the inserted documents:
#print(x.inserted_ids)