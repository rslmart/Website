from flask import Flask, jsonify, request
import pymongo
from flask_cors import CORS
from multiprocessing import Pool
import time
import datetime
import traceback

# TODO: Potentially save queries (cursors?) per user in memory (save significant time on searches with addiontal fields

app = Flask(__name__)
CORS(app)

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
imagesCol = mydb["images"]
imageOptionsCol = mydb["imageOptions"]
ibtracsCol = mydb["ibtracs"]

ibtracsKeys = ['_id', 'sid', 'season', 'number', 'basin', 'subbasin', 'name', 'iso_time', 'nature', 'lat', 'lon',
               'wmo_wind', 'wmo_pres', 'wmo_agency', 'track_type', 'dist2land', 'landfall', 'iflag', 'speed',
               'dir', 'date', 'imageIds']

def func(item):
    a = pymongo.MongoClient("mongodb://localhost:27017/")["mydatabase"]["imageOptions"].find(item[1])
    if item[0] != "satellite" and item[0] != "extension":
        return a.distinct(item[0])
    else:
        key = ""
        if item[0] == "satellite":
            key = "satellites"
        if item[0] == "extension":
            key = "extensions"
        resultSet = set()
        for result in a:
            for element in result[key]:
                resultSet.add(element)
        return list(resultSet)

def parseQuery(query):
    return {
        "$and": query["$and"] +
                [{"date": {"$gte": datetime.datetime.strptime(query["startTime"], "%Y-%m-%d %H:%M")}}] +
                [{"date": {"$lte": datetime.datetime.strptime(query["endTime"], "%Y-%m-%d %H:%M")}}]
    }

@app.route('/')
def hello_world():
    return 'Hello World!'

@app.route('/images/imageCount', methods=['POST'])
def imageCount():
    query = parseQuery(request.get_json())
    print(query)
    return jsonify({'count': imagesCol.count_documents(query)})

@app.route('/images/allOptions', methods=['GET'])
def imageAllOptions():
    keys = ['season', 'basin', 'number', 'agency', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'satellite']
    options = {}
    for key in keys:
        options[key] = imageOptionsCol.distinct(key)
    return jsonify({'options': options})

@app.route('/images/options', methods=['POST'])
def imageOptions():
    requestTime = time.time()
    keys = ['season', 'basin', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'extension']
    requestJson = request.get_json()
    print(requestJson)
    query = {
        "$and": requestJson["query"]["$and"] +
                [{"beginDate": {"$gte": datetime.datetime.strptime(requestJson["query"]["startTime"], "%Y-%m-%d %H:%M")}}] +
                [{"endDate": {"$lte": datetime.datetime.strptime(requestJson["query"]["endTime"], "%Y-%m-%d %H:%M")}}]
    }
    print(query)
    queryResult = imageOptionsCol.find(query)
    try:
        beginDate = queryResult.sort([("beginDate", 1)]).limit(1)[0]['beginDate'].strftime("%Y-%m-%d %H:%M")
    except IndexError:
        beginDate = requestJson["query"]["startTime"]
    try:
        endDate = queryResult.sort([("endDate", -1)]).limit(1)[0]['endDate'].strftime("%Y-%m-%d %H:%M")
    except IndexError:
        endDate = requestJson["query"]["endTime"]
    options = {}
    arr = [(key, query) for key in keys if key not in requestJson["keys"]]
    with Pool(4) as p:
        result = p.map(func, arr)
    for i in range(len(arr)):
        options[arr[i][0]] = result[i]
    return jsonify({
        'requestTime': requestTime,
        'options': options,
        'beginDate': beginDate,
        'endDate': endDate,
        'query': query
    })

@app.route('/images/query', methods=['POST'])
def imageQuery():
    requestJson = request.get_json()
    print(requestJson)
    query = parseQuery(requestJson["query"])
    output = []
    count = 0
    for s in imagesCol.find(query).sort([("date", 1)]):
        s['date'] = str(s['date'])
        output.append(s)
        count += 1
        if count > 2000:
             break
    print(output[0])
    return jsonify({'imageItems': output})

@app.route('/ibtracs/ibtracCount', methods=['POST'])
def ibtracCount():
    query = parseQuery(request.get_json())
    print(query)
    return jsonify({'count': ibtracsCol.count_documents(query)})

@app.route('/ibtracs/allOptions', methods=['GET'])
def ibtracAllOptions():
    keys = ['season', 'number', 'basin', 'subbasin', 'name', 'nature', 'wmo_agency', 'track_type', 'iflag']
    maxMinKeys = ['iso_time', 'lat', 'lon', 'wmo_wind', 'wmo_pres', 'dist2land', 'speed', 'dir', 'date',
                  'landfall']
    options = {}
    for key in keys:
        print(key)
        options[key] = ibtracsCol.distinct(key)
    for key in maxMinKeys:
        print(key)
        options[key] = {}
        options[key]['min'] = ibtracsCol.find_one({key: {"$exists": True}}, sort=[(key, 1)])[key]
        options[key]['max'] = ibtracsCol.find_one({key: {"$exists": True}}, sort=[(key, -1)])[key]
    return jsonify({'options': options})

@app.route('/ibtracs/options', methods=['POST'])
def ibtracOptions():
    requestTime = time.time()
    keys = ['season', 'basin', 'subbasin', 'name']
    maxMinKeys = ['lat', 'lon', 'wind', 'pres', 'dist2land', 'speed', 'gust', 'date']
    requestJson = request.get_json()
    print(requestJson)
    query = requestJson["query"]
    print(query)
    queryResult = ibtracsCol.find(query)
    options = {}
    for key in keys:
        if key not in requestJson["keys"]:
            print(key)
            options[key] = queryResult.distinct(key)
    for key in maxMinKeys:
        print(key)
        options[key] = {}
        if "$and" not in query:
            query["$and"] = []
        queryList = query["$and"] + [{key: {"$exists": True}}]
        q = {"$and": queryList}
        print(q)
        queryResult = ibtracsCol.find(q)
        if (queryResult.count() > 0):
            options[key]['min'] = queryResult.sort(key, pymongo.ASCENDING).limit(1)[0][key]
            options[key]['max'] = queryResult.sort(key, pymongo.DESCENDING).limit(1)[0][key]
        else:
            options[key]['min'] = -1
            options[key]['max'] = -1
    return jsonify({
        'requestTime': requestTime,
        'options': options,
        'query': query
    })

@app.route('/ibtracs/query', methods=['POST'])
def ibtracQuery():
    requestJson = request.get_json()
    print(requestJson)
    query = requestJson["query"]
    output = []
    if requestJson["storm"]:
        output = {}
    count = 0
    minLat, maxLat, minLon, maxLon = 90, -90, 180, -180
    for document in ibtracsCol.find(query):
        lat = document['lat']
        lon = document['lon']
        if lat > maxLat:
            maxLat = lat
        if lat < minLat:
            minLat = lat
        if lon > maxLon:
            maxLon = lon
        if lon < minLon:
            minLon = lon

        keys = ['season', 'name', 'wind', 'pres', 'gust', 'lat', 'lon', 'dist2land', 'storm_speed', 'storm_dir']
        tempDict = {
            'lat': lat,
            'lon': lon,
            'date': str(document['date'])
        }
        # Whether to organize the points by storm/time and include wind data
        if not requestJson["storm"]:
            output.append([lon, lat])
        else:
            if document['name'] not in output.keys():
                output[document['name']] = []
            tempDict = {
                'lat': lat,
                'lon': lon,
                'date': str(document['date'])
            }
            if 'wind' in document:
                tempDict['wind'] = document['wind']
            output[document['name']].append(tempDict)
        count += 1
    print(output[0])
    print(count)
    return jsonify({
        'ibtracData': output,
        'coordinates': {'lat': {'max': maxLat, 'min': minLat}, 'lon': {'max': maxLon, 'min': minLon}}
    })


if __name__ == '__main__':
    app.run()