import csv
import os
import pymongo
import datetime

def isInt(s):
    try:
        int(s)
        return True
    except ValueError:
        return False

def isFloat(s):
    try:
        float(s)
        return True
    except ValueError:
        return False

def searchForTerm(rowDict, term):
    if ('wmo' + term) in rowDict:
        return rowDict['wmo' + term]
    for key in rowDict.keys():
        if key.endswith(term):
            return rowDict[key]
    return -1

def parseRow(header, row):
    rowDict = {}
    for i in range(len(header)):
        if isInt(row[i]):
            rowDict[header[i]] = int(row[i])
        elif isFloat(row[i]):
            rowDict[header[i]] = float(row[i])
        else:
            if row[i].strip():
                rowDict[header[i]] = row[i]
    rowDict['_id'] = rowDict['sid'] + rowDict['iso_time'].replace(':', '').replace(' ', '').replace(':', '')
    rowDict['date'] = datetime.datetime.strptime(rowDict['iso_time'], "%Y-%m-%d %H:%M:%S")
    rowDict['day'] = rowDict['date'].day
    rowDict['month'] = rowDict['date'].month
    rowDict['year'] = rowDict['date'].year
    additional = ['_wind', '_pres', '_gust']
    for term in additional:
        val = searchForTerm(rowDict, term)
        if val >= 0:
            rowDict[term[1:]] = val
    return rowDict

'''
Errors:
1997216N20091,1997,62,NI,BB,NOT_NAMED,1997-08-05 03:00:00,NR,22.0000,88.0000,30,896,newdelhi,main -> pressure should be 996?
'''

if __name__ == '__main__':
    myclient = pymongo.MongoClient("mongodb://localhost:27017/")
    mydb = myclient["mydatabase"]
    mycol = mydb["ibtracs"]
    mycol.drop()
    filePath = os.path.join('..', 'Data', 'ibtracs', 'ibtracs.ALL.csv')

    print('Counting')
    totalSize = sum(1 for line in open(filePath))

    print('Inserting %d records' % totalSize)
    with open(filePath, 'r') as csvfile:
        reader = csv.reader(csvfile)
        header = next(reader)  # skip header
        for i in range(len(header)):
            header[i] = header[i].lower()
            # for storm_speed and storm_dir
            if header[i] == "storm_speed" or header[i] == "storm_dir":
                header[i] = header[i].split('_')[1]
        units = next(reader)

        batch_size = 10000
        batch = []
        count = 0
        totalCount = 0

        for row in reader:
            if int(row[1]) > 1996:
                if count >= batch_size:
                    x = mycol.insert_many(batch)
                    totalCount += count
                    print('Inserted {:d} ({:.2f} %)'.format(totalCount, (totalCount / totalSize) * 100))
                    batch = []
                    count = 0
                parsed = parseRow(header, row)
                batch.append(parsed)
                count += 1
            else:
                print(row[1])
        if batch:
            x = mycol.insert_many(batch)
            pass
    mycol.find_one_and_update(
        {'_id': "1997216N200911997-08-05030000"},
        {'$set': {'pres': 996, 'newdelhi_pres': 996, 'wmo_pres': 996}}
    )