import csv
import os
import pymongo

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
mycol = mydb["imageUrls"]

def parseRow(row):
    keys = ['season', 'basin', 'storm', 'type', 'satellite', 'resolution', 'image', 'imageUrl']
    rowDict = {}
    for i in range(len(row)):
        if row[i] != 'none':
            rowDict[keys[i]] = row[i]
    return rowDict

with open(os.path.join('..','Data','CSV','tcdat.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = next(reader)  # skip header

    batch_size = 100
    batch = []
    count = 0

    for row in reader:
        if count >= batch_size:
            # put in db
            batch = []
            count = 0
        batch.append(parseRow(row))
        count += 1
    if batch:
        pass

# x = mycol.insert_many(mylist)

#print list of the _id values of the inserted documents:
#print(x.inserted_ids)