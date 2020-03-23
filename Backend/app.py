from flask import Flask, jsonify, request
import pymongo
from flask_cors import CORS
from multiprocessing import Pool
import time
import datetime

app = Flask(__name__)
CORS(app)

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
imagesCol = mydb["images"]
imageOptionsCol = mydb["imageOptions"]
ibtracsCol = mydb["ibtracs"]


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
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'satellite']
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
        del s['_id']
        s['date'] = str(s['date'])
        output.append(s)
        count += 1
        if count > 2000:
             break
    print(output[0])
    return jsonify({'imageItems': output})


if __name__ == '__main__':
    app.run()