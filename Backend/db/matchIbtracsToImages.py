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

if __name__ == '__main__':
    with open('stormMapping.p', 'rb') as file:
        mapping = pickle.load(file)

    count = 0
    for season in mapping:
        for basin in mapping[season]:
            for storm in mapping[season][basin]:
                id = mapping[season][basin][storm]
                if id != '':
                    count += 1
                    print(season, basin, storm, mapping[season][basin][storm])
                    images = imagesDB.find(
                        {'$and': [{'season': season}, {'basin': basin}, {'storm_name': storm}]}).sort('date')
                    ibtracs = ibtracsDB.find({'sid': id}).sort('date')
                    pointer = 0
                    for image in images:
                        matched = False
                        while not matched:
                            if ((ibtracs[pointer]['date'] < image['date'] < ibtracs[pointer + 1]['date']) or
                                    (pointer + 1 == ibtracs.count() and image['date'] < ibtracs[pointer]['date']) or
                                    (pointer == 0 and image['date'] > ibtracs[pointer])):
                                firstDiff = abs(ibtracs[pointer]['date'] - image['date'])
                                secondDiff = abs(ibtracs[pointer + 1]['date'] - image['date'])
                                if firstDiff <= secondDiff:
                                    images['ibtracs'] = ibtracs[pointer]['_id']
                                else:
                                    images['ibtracs'] = ibtracs[pointer + 1]['_id']
                                matched = True
                            else:
                                pointer += 1
    print(count)
